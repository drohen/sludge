import type { ServerRequest } from "https://deno.land/std/http/server.ts"
import { join } from "https://deno.land/std/path/mod.ts"
import { multiParser, Form, FormFile } from 'https://deno.land/x/multiparser@v2.0.3/mod.ts'

export interface UploadDataProvider
{
	addSegmentURL: ( segmentID: string, streamPublicID: string, segmentURL: URL ) => Promise<void>

	getStreamPublicIDFromStreamAdminID: ( streamAdminID: string ) => Promise<string>
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

	public async process( req: ServerRequest, streamAdminID: string ): Promise<string> 
	{
		const contentType: string | null = req.headers.get( `content-type` )

		if ( !contentType ) 
		{
			throw Error( `Missing content type header\n` )
		}

		const streamPublicID = await this.data.getStreamPublicIDFromStreamAdminID( streamAdminID )

		// boundaries are used to communicate request data structure
		// https://www.w3.org/TR/html401/interact/forms.html#h-17.13.4.2

		// need to wait before response, otherwise connection will close
		// before we have all the data!

		const form: Form | undefined = await multiParser( req )

		const formFile: FormFile | FormFile[] | undefined = form?.files.audio

		// form data isn't valid/usable, exit
		if ( !formFile || Array.isArray( formFile ) || !formFile.content || formFile.content.byteLength > 4000 )
		{
			throw Error( `Bad upload` )
		}

		const segmentID = await this.random.uuid()

		const fileLocation = join( streamPublicID, `${segmentID}.opus` )

		const file = await Deno.open( 
			join( this.core.rootDir(), `audio`, fileLocation ), 
			{
				write: true,
				create: true,
			} )

		await Deno.write( file.rid, formFile.content )

		Deno.close( file.rid )

		return new Promise<string>( resolve =>
		{
			const segmentURL = new URL( fileLocation, this.core.fileURL() )

			resolve( segmentURL.toString() )

			this.data.addSegmentURL(
				segmentID,
				streamPublicID,
				segmentURL
			)
				.catch( e =>
				{
					console.error( e )

					console.error( `Failed to create segment entry ${segmentID} for ${streamPublicID}` )
				} )	
		} )
	}
}