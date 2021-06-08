import type { ServerRequest, Response } from "https://deno.land/std/http/server.ts"
import { StreamStart } from "./db.ts"

export interface UserStreamData 
{
	admin: string
	public: string
}

export interface Segment
{
	segmentID: string
	streamPublicID: string
	segmentURL: string
}

export interface RequestsDataProvider
{
	getSegmentList: ( streamPublicID: string, segmentID?: string, type?: StreamStart ) => Promise<Segment[]>
}

export interface RequestsUUIDProvider
{
	validateUUID: ( uuid: string ) => boolean
}

export interface RequestsActionsProvider
{
	createStream: () => Promise<UserStreamData>

	fetchStream: ( streamAdminID: string ) => Promise<UserStreamData>

	processUploadFormData: ( request: ServerRequest, streamAdminID: string ) => Promise<string>
}

enum Method
{
	GET = `GET`,
	POST = `POST`,
	OPTIONS = `OPTIONS`
}

type MethodHandlerFn = ( req: ServerRequest ) => Promise<Response>

export class RequestHandler
{
	private encoder: TextEncoder

	private methodHandler: Record<Method, MethodHandlerFn>

	private validMethods: string[]

	constructor(
		private action: RequestsActionsProvider,
		private data: RequestsDataProvider,
		private uuid: RequestsUUIDProvider
	)
	{
		this.encoder = new TextEncoder()

		this.validMethods = Object.keys( Method )

		this.methodHandler = {
			[ Method.GET ]: async ( req: ServerRequest ) =>
				await this.get( req ),
			[ Method.POST ]: async ( req: ServerRequest ) =>
				await this.post( req ),
			[ Method.OPTIONS ]: async () =>
				( { status: 200 } )
		}
	}

	private isMethod( method: string ): method is Method
	{
		return this.validMethods.includes( method )
	}

	private invalidRequest()
	{
		return {
			body: this.encode( `This is not a valid request.` ),
			status: 400
		}
	}

	/**
	 * Encoder to be reused throughout requests
	 */
	private encode( text: string ): Uint8Array
	{
		return this.encoder.encode( text )
	}

	private getStartValueFromQuery( url: URL ): string
	{
		return url.searchParams.get( `start` ) ?? ``
	}

	private url( path: string ): URL
	{
		return new URL( path, `http://0.0.0.0` )
	}

	/**
	 * POST request
	 *
	 * `/<stream admin id>` -> upload audio
	 *
	 * `/stream` -> create new stream
	 */
	private async post( req: ServerRequest ): Promise<Response> 
	{
		const path: string[] = req.url.split( `/` )
		
		if ( path[ 1 ] === `stream` ) 
		{
			// create stream id

			const headers = new Headers()

			headers.set( `content-type`, `application/json` )

			return {
				body: this.encode(
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

		// /<stream admin id>
		// post adds file
		// need to match uuid in KV
		// aka handleform
		const url = await this.action.processUploadFormData( req, path[ 1 ] )

		return { body: this.encode( url ), status: 200 }
	}

	/**
	 * GET requests
	 *
	 * `/<stream admin id>/admin` -> fetch stream info
	 *
	 * `/<stream public id>` -> fetch stream playlist from start
	 *
	 * `/<stream public id>/random` -> fetch stream playlist at random point
	 *
	 * `/<stream public id>/latest` -> fetch stream playlist latest segments
	 *
	 * `/<stream public id>/<segment id>` -> fetch stream playlist after segment
	 */
	private async get( req: ServerRequest ): Promise<Response> 
	{
		const url = this.url( req.url )

		const path: string[] = url.pathname.split( `/` )

		if ( !this.uuid.validateUUID( path[ 1 ] ) ) 
		{
			throw Error( `Invalid path` )
		}

		const headers = new Headers()

		headers.set( `content-type`, `application/json` )

		/**
		 * path[2] might be
		 * 	- admin
		 * 	- random
		 * 	- latest
		 * 	- ID
		 * 	- none
		 * 	- some unknown value
		 * If none, we also check if there's a query value named
		 * "start" which should be one of admin, random or latest
		 */
		const start = path[ 2 ] || this.getStartValueFromQuery( url )

		switch( start )
		{
			case `admin`:
				// /<stream admin id>/admin
				return {
					body: this.encode( JSON.stringify( await this.action.fetchStream( path[ 1 ] ) ) ),
					status: 200,
					headers
				}

			case `random`:
				// return playlist from random
				// /<stream public id>/random
				return {
					body: this.encode( JSON.stringify( await this.data.getSegmentList(
						path[ 1 ],
						undefined,
						StreamStart.random
					) ) ),
					status: 200,
					headers
				}

			case `latest`:
				// return playlist latest segments
				// /<stream public id>/latest
				return {
					body: this.encode( JSON.stringify( await this.data.getSegmentList(
						path[ 1 ],
						undefined,
						StreamStart.latest
					) ) ),
					status: 200,
					headers
				}

			default:
				// return playlist from segment or start
				// /<stream public id>/<segment?>
				return {
					body: this.encode( JSON.stringify( await this.data.getSegmentList(
						path[ 1 ],
						this.uuid.validateUUID( path[ 2 ] ) ? path[ 2 ] : undefined
					) ) ),
					status: 200,
					headers
				}
		}
	}

	private async callHandlerOrError( req: ServerRequest, fn?: MethodHandlerFn ): Promise<Response>
	{
		try
		{
			return await fn?.( req ) ?? this.invalidRequest()
		}
		catch ( e ) 
		{
			return {
				body: this.encode( e.message ),
				status: 404
			}
		}
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
		const { method } = req

		if ( !this.isMethod( method ) ) return this.invalidRequest()

		return await this.callHandlerOrError( req, this.methodHandler[ method ] )
	}

	/**
	 * Main function used to handle all server requests
	 * @param req Any given server request
	 */
	public async handle( req: ServerRequest ): Promise<void> 
	{
		req.respond( await this.selectMethod( req ) )
	}
}