import { FormFile, MultipartFormData, MultipartReader } from "https://deno.land/std/mime/multipart.ts"
import type { ServerRequest } from "https://deno.land/std/http/server.ts"
import { join } from "https://deno.land/std/path/mod.ts"

export interface UploadDataProvider
{
	addSegmentURL: ( id: string, streamID: string, url: URL ) => Promise<void>

	getIDFromStreamAlias: ( streamAlias: string ) => Promise<string>
}

export interface UploadRandomProvider
{
	uuid: () => Promise<string>
}

export interface UploadCoreProvider
{
	rootDir: () => string

	fileURL: () => URL
}

export class UploadFormHandler
{
	constructor(
		private core: UploadCoreProvider,
		private data: UploadDataProvider,
		private random: UploadRandomProvider
	)
	{}

	public async process( req: ServerRequest, streamAlias: string ): Promise<void> 
	{
		const contentType: string | null = req.headers.get( `content-type` )

		if ( !contentType ) 
		{
			throw Error( `Missing content type header\n` )
		}

		const streamID = await this.data.getIDFromStreamAlias( streamAlias )

		// boundaries are used to communicate request data structure
		// https://www.w3.org/TR/html401/interact/forms.html#h-17.13.4.2

		// need to wait before response, otherwise connection will close
		// before we have all the data!

		const reader = new MultipartReader( 
			req.r, 
			contentType.substr( contentType.indexOf( `=` ) + 1 ) )

		const data: MultipartFormData = await reader.readForm()

		const formFile: FormFile | FormFile[] | undefined = data.file( `audio` )

		// we have the file data, connection can close now
		if ( !formFile || Array.isArray( formFile ) || !formFile.content ) return

		const id = await this.random.uuid()

		const fileLocation = join( streamID, `${id}.opus` )

		const file = await Deno.open( 
			join( this.core.rootDir(), `audio`, fileLocation ), 
			{
				write: true,
				create: true,
			} )

		await Deno.write( file.rid, formFile.content )

		Deno.close( file.rid )

		Promise.resolve()

		try 
		{
			await this.data.addSegmentURL(
				id,
				streamID,
				new URL( fileLocation, this.core.fileURL() )
			)
		}
		catch ( e )
		{
			console.error( `Failed to create segment entry ${id} for ${streamID}` )
		}
	}
}