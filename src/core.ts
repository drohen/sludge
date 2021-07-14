import { serve, Server, ServerRequest } from "https://deno.land/std/http/server.ts"
import * as sqlite from "https://deno.land/x/sqlite/mod.ts"
import { DBInterface, DBActionsProvider } from "./db.ts"
import { RequestHandler, RequestsActionsProvider, RequestsDataProvider, RequestsUUIDProvider, UserStreamData } from "./requestHandler.ts"
import { StreamHandler, StreamCoreProvider, StreamDataProvider, StreamUUIDProvider, Stream } from "./streamHandler.ts"
import { UploadCoreProvider, UploadDataProvider, UploadFormHandler } from "./uploadFormHandler.ts"
import { Random } from "./random.ts"

export type RandomProvider = 
	& DBActionsProvider
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

	private dbAPI: DBInterface

	private random: Random

	/**
	 * 
	 * @param _publicURL URL/path where server will be accessed from
	 * @param port port to run sludge server
	 * @param _rootDir location of root file dir
	 * @param dbPath location of database for server
	 * @param _fileURL URL/path where files will be accessed from
	 * @param idLength Length of ID
	 * @param idAlphabet Alphabet for ID
	 */
	constructor(
		private _publicURL: URL,
		private port: number,
		private _rootDir: string,
		private dbPath: string,
		private _fileURL: URL,
		idLength: number,
		idAlphabet: string
	)
	{
		this.random = new Random( idLength, idAlphabet )

		this.db = new sqlite.DB( this.dbPath )

		this.dbAPI = new DBInterface( this.db, this.random )

		this.server = serve( `0.0.0.0:${this.port}` )

		this.requestHandler = new RequestHandler( this, this.dbAPI, {
			validateUUID: uuid => this.random.validateUUID( uuid ),
			validateSegmentUUID: uuid =>
			{
				return ( uuid.length >= 8 && !isNaN( parseInt( uuid ) ) )
					|| this.random.validateUUID( uuid )
			}
		} )

		this.streamHandler = new StreamHandler( this, this.dbAPI, this.random )

		this.uploadHandler = new UploadFormHandler( this, this.dbAPI )
	}

	/**
	 * return public path for upload/ UI/ public stream
	 * @param stream Object containing public and admin IDs for a given stream
	 */
	private getStreamData( stream: Stream ): UserStreamData
	{
		return {
			admin: new URL( `${stream.adminID}/admin`, this._publicURL ).toString(),
			public: new URL( stream.publicID, this._publicURL ).toString()
		}
	}

	/**
	 * Server should close and close DB connection on end
	 */
	private close()
	{
		this.db.close()

		this.server.close()
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