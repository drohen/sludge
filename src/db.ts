import type * as sqlite from "https://deno.land/x/sqlite/mod.ts"
import type { DataProvider } from "./core.ts"
import type { Segment } from "./requestHandler.ts"
import type { Stream } from "./streamHandler.ts"

enum DataType 
{
	string = `TEXT`,
	int = `INTEGER`
}

export interface DBActionsProvider
{
	random: ( min: number, max: number ) => Promise<number>
}

export enum StreamStart
{
	start = `start`,
	latest = `latest`,
	random = `random`
}

export class DBInterface implements DataProvider
{
	private emptyList: []

	private streamSelect: string

	constructor(
		private db: sqlite.DB,
		private random: DBActionsProvider
	)
	{
		this.emptyList = []

		this.streamSelect = [
			`SELECT segmentID, streamPublicID, segmentURL FROM segments`,
			`WHERE streamPublicID = $streamPublicID AND rowid > (SELECT rowid FROM segments WHERE segmentID = $segmentID) LIMIT 10;`
		].join( ` ` )

		this.init()
	}

	private createTableQuery( 
		table: string,
		values: [string, DataType][] 
	): string 
	{
		return [
			`CREATE TABLE IF NOT EXISTS`,
			table,
			`(${values.map( ( v ) => v.join( ` ` ) ).join( `, ` )})`
		].join( ` ` )
	}

	private init()
	{
		/**
		 * publicID -> public access id for playlist/audio files
		 * adminID -> secret id for uploads/ streaming
		 * created -> datetime stream was generated
		 */
		this.db.query(
			this.createTableQuery(
				`streams`,
				[
					[ `publicID`, DataType.string ],
					[ `adminID`, DataType.string ],
					[ `created`, DataType.int ]
				]
			),
			[]
		)
	
		/**
		 * segmentID -> id for audio file segment retrieval
		 * streamID -> id of linked stream
		 * segmentURL -> public url for file request
		 */
		this.db.query(
			this.createTableQuery(
				`segments`,
				[
					[ `segmentID`, DataType.string ],
					[ `streamPublicID`, DataType.string ],
					[ `segmentURL`, DataType.string ]
				]
			),
			[]
		)
	}

	private getStreamSegmentsByID( streamPublicID: string, segmentID: string )
	{
		const segments: Segment[] = []

		try 
		{
			const rows = this.db.query(
				this.streamSelect,
				{
					$segmentID: segmentID,
					$streamPublicID: streamPublicID
				}
			)
	
			for ( const row of rows ) 
			{
				if ( row ) 
				{
					const [ segmentID, streamPublicID, segmentURL ] = row
	
					segments.push( { segmentID, streamPublicID, segmentURL } )
				}
			}
	
			return segments
		}
		catch ( e )
		{
			console.error( e )

			throw Error( `Could not get segments for stream.` )
		}
	}

	private async getStreamsSegmentsRandom( streamPublicID: string )
	{
		const count = this.streamSegmentsCount( streamPublicID )

		if ( !count ) 
		{
			return this.emptyList
		}
		
		/**
		 * If there are more than 10 segments, set offset index to some number
		 * between 0 and total segments - 9, to ensure there's always 10
		 * segment URLs being returned.
		 * 
		 * Less than 10 segments, just return everything
		 */
		const offset = count > 10
			? await this.random.random( 0, count - 9 )
			: 0

		try 
		{
			return this.db.query(
				`SELECT segmentID, streamPublicID, segmentURL FROM segments WHERE streamPublicID = $streamPublicID LIMIT 10 OFFSET $offset;`,
				{
					$streamPublicID: streamPublicID,
					$offset: offset
				}
			)
		}
		catch ( e )
		{
			console.error( e )

			throw Error( `Could not get segments for stream.` )
		}
	}

	private async getStreamsSegmentsLatest( streamPublicID: string )
	{
		try 
		{
			return this.db.query(
				`SELECT segmentID, streamPublicID, segmentURL FROM segments WHERE streamPublicID = $streamPublicID ORDER BY rowid DESC LIMIT 10;`,
				{
					$streamPublicID: streamPublicID
				}
			)
		}
		catch ( e )
		{
			console.error( e )

			throw Error( `Could not get segments for stream.` )
		}
	}

	private getStreamSegmentsStart( streamPublicID: string )
	{
		try 
		{
			return this.db.query(
				`SELECT segmentID, streamPublicID, segmentURL FROM segments WHERE streamPublicID = $streamPublicID LIMIT 10;`,
				{
					$streamPublicID: streamPublicID
				}
			)
		}
		catch ( e )
		{
			console.error( e )

			throw Error( `Could not get segments for stream.` )
		}
	}

	private streamSegmentsCount( streamPublicID: string ): number
	{
		const count = this.db.query(
			`SELECT COUNT(*) FROM segments WHERE streamPublicID = $streamPublicID;`,
			{
				$streamPublicID: streamPublicID
			}
		)

		if ( !count ) 
		{
			return 0
		}

		const value = count.next().value

		return value && value[ 0 ] ? value[ 0 ] : 0
	}

	private async selectStreamSegmentsFromStartType( streamPublicID: string, type: StreamStart )
	{
		switch( type )
		{
			case StreamStart.start:

				return this.getStreamSegmentsStart( streamPublicID )

			case StreamStart.random:

				return await this.getStreamsSegmentsRandom( streamPublicID )

			case StreamStart.latest:

				return this.getStreamsSegmentsLatest( streamPublicID )
		}
	}

	public async getSegmentList( streamPublicID: string, segmentID?: string, type: StreamStart = StreamStart.start ): Promise<Segment[]>
	{
		if ( segmentID ) 
		{
			// if segment id, return all after segment ID
			return this.getStreamSegmentsByID( streamPublicID, segmentID )
		}
		else 
		{
			const rows = await this.selectStreamSegmentsFromStartType( streamPublicID, type )

			const segments: Segment[] = []

			for ( const row of rows ) 
			{
				if ( row ) 
				{
					const [ segmentID, streamPublicID, segmentURL ] = row

					segments.push( { segmentID, streamPublicID, segmentURL } )
				}
			}

			return segments
		}
	}

	public async getStream( adminID: string ): Promise<Stream>
	{
		const rows = this.db.query(
			`SELECT publicID, adminID, created FROM streams WHERE adminID = $adminID;`,
			{ $adminID: adminID }
		)

		for ( const row of rows ) 
		{
			if ( row ) 
			{
				return {
					publicID: row[ 0 ],
					adminID: row[ 1 ],
					created: row[ 2 ]
				}
			}
		}

		throw Error( `Stream not found.` )
	}

	public async createStream( publicID: string, adminID: string ): Promise<Stream>
	{
		try 
		{	
			this.db.query( 
				`INSERT INTO streams VALUES ($publicID, $adminID, $created);`, 
				{
					$publicID: publicID,
					$adminID: adminID,
					$created: Date.now()
				} )
		}
		catch ( e )
		{
			// TODO: log error
			console.error( e )

			throw Error( `Failed to create stream.` )
		}

		const stream = await this.getStream( adminID )

		if ( !stream )
		{
			throw Error( `Could not create stream.` )
		}

		return stream
	}

	public async addSegmentURL( segmentID: string, streamPublicID: string, segmentURL: URL ): Promise<void>
	{
		try 
		{
			this.db.query( 
				`INSERT INTO segments VALUES ($segmentID, $streamPublicID, $segmentURL);`, 
				{
					$segmentID: segmentID,
					$streamPublicID: streamPublicID,
					$segmentURL: segmentURL.toString()
				} )
		}
		catch ( e )
		{
			// TODO: log error
			console.error( e )

			throw Error( `Failed to add segment.` )
		}
	}

	public async getStreamPublicIDFromStreamAdminID( adminID: string ): Promise<string>
	{
		const stream = await this.getStream( adminID )

		if ( !stream || !stream.publicID ) 
		{
			throw Error( `Stream not found.` )
		}

		return stream.publicID
	}
}