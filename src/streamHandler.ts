import * as path from "https://deno.land/std/path/mod.ts"

export interface Stream 
{
	publicID: string
	adminID: string
	created: number
}

export interface StreamDataProvider
{
	getStream: ( adminID: string ) => Promise<Stream>

	createStream: ( publicID: string, adminID: string ) => Promise<Stream>
}

export interface StreamCoreProvider
{
	rootDir: () => string
}

export interface StreamUUIDProvider
{
	uuid: () => Promise<string>
}

export class StreamHandler
{
	constructor(
		private core: StreamCoreProvider,
		private data: StreamDataProvider,
		private random: StreamUUIDProvider
	)
	{}

	// TODO: add docs
	public async get( adminID: string ): Promise<Stream> 
	{
		return await this.data.getStream( adminID )
	}

	public async create(): Promise<Stream>
	{
		// Used for public access to stream segments list, segment files (dir)
		const publicID: string = await this.random.uuid()

		// Used for owner to add segments, get admin info, add/remove hubs
		const adminID: string = await this.random.uuid()

		// create dir for storing segment files for public access
		const dirPath: string = path.join( this.core.rootDir(), `audio`, publicID )

		await Deno.mkdir( dirPath )

		// add admin id/public id to file/store
		return await this.data.createStream( publicID, adminID )
	}
}