import * as path from "https://deno.land/std/path/mod.ts"

export interface Stream 
{
	id: string
	alias: string
	created: number
}

export interface StreamDataProvider
{
	getStream: ( streamAlias: string ) => Promise<Stream>

	createStream: ( id: string, streamAlias: string ) => Promise<Stream>
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
	public async get( streamAlias: string ): Promise<Stream> 
	{
		return await this.data.getStream( streamAlias )
	}

	public async create(): Promise<Stream>
	{
		const id: string = await this.random.uuid()

		const streamAlias: string = await this.random.uuid()

		// create dir
		const dirPath: string = path.join( this.core.rootDir(), `audio`, id )

		await Deno.mkdir( dirPath, { recursive: true } )

		// add alias/id to file/store
		return await this.data.createStream( id, streamAlias )
	}
}