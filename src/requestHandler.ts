import type { ServerRequest, Response } from "https://deno.land/std/http/server.ts"

export interface UserStreamData 
{
	admin: string
	download: string
	hub: string
}

export interface Segment
{
	id: string
	streamID: string
	url: string
}

export interface RequestsDataProvider
{
	getSegmentList: ( streamID: string, segmentID?: string ) => Promise<Segment[]>
}

export interface RequestsUUIDProvider
{
	validateUUID: ( uuid: string ) => boolean
}

/**
 * streamAlias = stream admin ID used to manage/access stream data
 */
export interface RequestsActionsProvider
{
	createStream: () => Promise<UserStreamData>

	fetchStream: ( streamAlias: string ) => Promise<UserStreamData>

	processUploadFormData: ( request: ServerRequest, streamAlias: string ) => Promise<void>

	// should throw if couldn't create hub
	// return hub id
	connectStreamToHub: ( hubURL: URL, streamAlias: string ) => Promise<void> 

	disconnectStreamFromHub: ( hubURL: URL, streamAlias: string ) => Promise<void>

	connectedHubs: ( streamAlias: string ) => Promise<string[]>

	encodeText: ( text: string ) => Uint8Array

	decodeText: ( binary: Uint8Array ) => string
}

export class RequestHandler
{

	constructor(
		private action: RequestsActionsProvider,
		private data: RequestsDataProvider,
		private uuid: RequestsUUIDProvider
	)
	{}

	/**
	 * POST request
	 *
	 * `/<alias>` -> upload audio
	 *
	 * `/stream` -> create new stream
	 */
	private async post( req: ServerRequest ): Promise<Response> 
	{
		const path: string[] = req.url.split( `/` )

		try 
		{
			if ( path[ 1 ] === `stream` ) 
			{
				// create stream id

				const headers = new Headers()

				headers.set( `content-type`, `application/json` )

				return {
					body: this.action.encodeText(
						JSON.stringify( await this.action.createStream() )
					),
					status: 200,
					headers
				}
			}

			if ( !this.uuid.validateUUID( path[ 1 ] ) ) 
			{
				throw Error( `Invalid path` )
			}

			// /<stream alias>
			// post adds file
			// need to match uuid in KV
			// aka handleform
			await this.action.processUploadFormData( req, path[ 1 ] )

			return { body: this.action.encodeText( `Success\n` ), status: 200 }
		}
		catch ( e ) 
		{
			return {
				body: this.action.encodeText( e.message ),
				status: 404
			}
		}
	}

	/**
	 * PUT reqest
	 *
	 * `/<alias>/admin` -> add hub to stream
	 */
	private async put( req: ServerRequest ): Promise<Response> 
	{
		const path: string[] = req.url.split( `/` )

		try 
		{
			if ( !this.uuid.validateUUID( path[ 1 ] ) || path[ 2 ] !== `admin` ) 
			{
				throw Error( `Invalid path` )
			}

			if ( !req.contentLength ) 
			{
				throw Error( `No data` )
			}

			const hubURL: URL = new URL( this.action.decodeText(
				await Deno.readAll( req.body )
			) )

			// /<stream alias>
			// get hub url from body
			// TODO: does this work without await?
			this.action.connectStreamToHub( hubURL, path[ 1 ] )

			return { status: 200 }
		}
		catch ( e ) 
		{
			return {
				body: this.action.encodeText( e.message ),
				status: 404
			}
		}
	}

	/**
	 * DELETE reqest
	 *
	 * `/<alias>/admin` -> rm hub from stream
	 */
	private async delete( req: ServerRequest ): Promise<Response> 
	{
		const path: string[] = req.url.split( `/` )

		try 
		{
			if ( !this.uuid.validateUUID( path[ 1 ] ) || path[ 2 ] !== `admin` ) 
			{
				throw Error( `Invalid path` )
			}

			if ( !req.contentLength ) 
			{
				throw Error( `No data` )
			}

			const url: URL = new URL( this.action.decodeText(
				await Deno.readAll( req.body )
			) )

			// /<stream alias>
			// get hub url from body
			await this.action.disconnectStreamFromHub( url, path[ 1 ] )

			return {
				status: 200
			}
		}
		catch ( e ) 
		{
			return {
				body: this.action.encodeText( e.message ),
				status: 404
			}
		}
	}

	/**
	 * GET requests
	 *
	 * `/<alias>/hubs` -> fetch stream hub list
	 *
	 * `/<alias>/admin` -> fetch stream info
	 *
	 * `/<id>` -> fetch stream playlist
	 *
	 * `/<id>/<segment id>` -> fetch stream playlist after segment
	 */
	private async get( req: ServerRequest ): Promise<Response> 
	{
		const path: string[] = req.url.split( `/` )

		try
		{
			if ( !this.uuid.validateUUID( path[ 1 ] ) ) 
			{
				throw Error( `Invalid path` )
			}

			const headers = new Headers()

			headers.set( `content-type`, `application/json` )

			switch( path[ 2 ] )
			{
				// /<stream alias>/hubs
				case `hubs`:

					return {
						body: this.action.encodeText( JSON.stringify( await this.action.connectedHubs( path[ 1 ] ) ) ),
						status: 200,
						headers
					}

				// /<stream alias>/admin
				case `admin`:
					
					return {
						body: this.action.encodeText( JSON.stringify( await this.action.connectedHubs( path[ 1 ] ) ) ),
						status: 200,
						headers
					}

				default:

					// return playlist
					// /<stream id>/<segment?>
					return {
						body: this.action.encodeText( JSON.stringify( await this.data.getSegmentList(
							path[ 1 ],
							this.uuid.validateUUID( path[ 2 ] ) ? path[ 2 ] : undefined
						) ) ),
						status: 200,
						headers
					}
			}
		}
		catch ( e ) 
		{
			return {
				body: this.action.encodeText( e.message ),
				status: 404
			}
		}
	}

	// TODO: move to nginx?
	// required for streaming requests
	private setCORS( res: Response ): Response 
	{
		if ( !res.headers ) 
		{
			res.headers = new Headers()
		}

		res.headers.append( `access-control-allow-origin`, `*` )

		res.headers.append( `access-control-allow-method`, `GET` )

		res.headers.append(
			`access-control-allow-headers`,
			`Origin, X-Requested-With, Content-Type, Accept, Range`
		)

		return res
	}

	// nginx static routes
	// if /stream
	// get 2 = uuid, return splutter for streaming ui
	// need to match uuid in KV
	// if /
	// get ui to create stream
	// if /audio/streamId/segmentId
	// let nginx return audio files from dir
	private async selectMethod( req: ServerRequest )
	{
		switch ( req.method ) 
		{
			case `GET`:
				return await this.get( req )
	
			case `POST`:
				return await this.post( req )
	
			case `PUT`:
				return await this.put( req )
	
			case `DELETE`:
				return await this.delete( req )
	
			case `OPTIONS`:
				return { status: 200 }
	
			default:
				return {
					body: this.action.encodeText( `This is not a valid request.` ),
					status: 400
				}
		}
	}

	public async handle( req: ServerRequest ): Promise<void> 
	{
		req.respond( this.setCORS( await this.selectMethod( req ) ) )
	}
}