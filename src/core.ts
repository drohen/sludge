import { serve, Server, ServerRequest } from "https://deno.land/std/http/server.ts"
import * as sqlite from "https://deno.land/x/sqlite/mod.ts"
import { DBInterface, DBActionsProvider } from "./db.ts"
import { RequestHandler, RequestsActionsProvider, RequestsDataProvider, RequestsUUIDProvider, UserStreamData } from "./requestHandler.ts"
import { StreamHandler, StreamCoreProvider, StreamDataProvider, StreamUUIDProvider, Stream } from "./streamHandler.ts"
import { UploadCoreProvider, UploadDataProvider, UploadFormHandler, UploadRandomProvider } from "./uploadFormHandler.ts"
import { Random } from "./random.ts"

export type RandomProvider = 
	& DBActionsProvider
	& UploadRandomProvider
	& RequestsUUIDProvider
	& StreamUUIDProvider

export type DataProvider = 
	& RequestsDataProvider
	& StreamDataProvider
	& UploadDataProvider

export class Core 
implements
	RequestsActionsProvider, 
	StreamCoreProvider,
	UploadCoreProvider
{
	private db: sqlite.DB

	private server: Server

	private requestHandler: RequestHandler
	
	private streamHandler: StreamHandler

	private uploadHandler: UploadFormHandler

	private encoder: TextEncoder

	private decoder: TextDecoder

	private dbAPI: DBInterface

	private random: Random

	constructor(
		private _publicURL: URL,
		private port: number,
		private _rootDir: string,
		private dbPath: string,
		private _fileURL: URL
	)
	{
		this.random = new Random()

		this.db = new sqlite.DB( this.dbPath )

		this.dbAPI = new DBInterface( this.db, this.random )

		this.server = serve( `0.0.0.0:${this.port}` )

		this.requestHandler = new RequestHandler( this, this.dbAPI, this.random )

		this.streamHandler = new StreamHandler( this, this.dbAPI, this.random )

		this.uploadHandler = new UploadFormHandler( this, this.dbAPI, this.random )

		this.encoder = new TextEncoder()

		this.decoder = new TextDecoder()
	}

	// return public path for upload/ UI/ public stream
	private getStreamData( stream: Stream ): UserStreamData
	{
		return {
			admin: new URL( `${stream.adminID}/admin`, this._publicURL ).toString(),
			public: new URL( stream.publicID, this._publicURL ).toString()
		}
	}

	private close()
	{
		this.db.close()

		this.server.close()
	}

	public encodeText( text: string ): Uint8Array
	{
		return this.encoder.encode( text )
	}

	public decodeText( binary: Uint8Array ): string
	{
		return this.decoder.decode( binary )
	}

	public async run(): Promise<void>
	{
		try 
		{
			for await ( const req of this.server ) 
			{
				await this.requestHandler.handle( req )
			}
	
			this.close()
		}
		catch ( e ) 
		{
			this.close()

			throw e
		}
	}

	public async createStream(): Promise<UserStreamData>
	{
		return this.getStreamData( await this.streamHandler.create() )
	}

	public async fetchStream( adminID: string ): Promise<UserStreamData>
	{
		return this.getStreamData( await this.streamHandler.get( adminID ) )
	}

	public async processUploadFormData( request: ServerRequest, adminID: string ): Promise<string>
	{
		return await this.uploadHandler.process( request, adminID )
	}

	public publicURL(): URL
	{
		return this._publicURL
	}

	public fileURL(): URL
	{
		return this._fileURL
	}

	public rootDir(): string
	{
		return this._rootDir
	}
}