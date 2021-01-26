import type * as sqlite from "https://deno.land/x/sqlite/mod.ts"
import type { Hub } from "./hubHandler.ts"
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

export class DBInterface implements DataProvider
{
	private emptyList: []

	constructor(
		private db: sqlite.DB,
		private random: DBActionsProvider
	)
	{
		this.emptyList = []

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
		 * hubID -> id returned from hub store for future delete req
		 * hubURL -> hub url for finding the stream
		 * streamAdminID -> admin id of linked stream
		 */
		this.db.query(
			this.createTableQuery(
				`hubs`,
				[
					[ `hubID`, DataType.string ],
					[ `hubURL`, DataType.string ],
					[ `streamAdminID`, DataType.string ]
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
				`SELECT segmentID, streamPublicID, segmentURL FROM segments WHERE streamPublicID = $streamPublicID AND rowid > (SELECT rowid FROM segments WHERE id = $segmentID) LIMIT 10;`,
				{
					$segmentID: segmentID,
					$streamPublicID: streamPublicID
				}
			)
	
			for ( const row of rows ) 
			{
				if ( row ) 
				{
					const [ id, streamID, url ] = row
	
					segments.push( { segmentID: id, streamPublicID: streamID, segmentURL: url } )
				}
			}
	
			return segments
		}
		catch ( e )
		{
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
			? this.random.random( 0, count - 9 )
			: 0

		try 
		{
			return this.db.query(
				`SELECT segmentID, streamPublicID, segmentURL FROM segments WHERE streamPublicID = $streamPublicID LIMIT 10 OFFSET $offset;`,
				{
					$streamID: streamPublicID,
					$offset: offset
				}
			)
		}
		catch ( e )
		{
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
			throw Error( `Could not get segments for stream.` )
		}
	}

	private streamSegmentsCount( streamPublicID: string )
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

	private async selectStreamSegmentsFromRandomOrStart( streamPublicID: string, type: `random` | `start` = `random` )
	{
		switch( type )
		{
			case `start`:

				return this.getStreamSegmentsStart( streamPublicID )

			case `random`:

				return await this.getStreamsSegmentsRandom( streamPublicID )

		}
	}

	public async getSegmentList( streamPublicID: string, segmentID?: string, type: `random` | `start` = `random` ): Promise<Segment[]>
	{
		if ( segmentID ) 
		{
			// if segment id, return all after segment ID
			return this.getStreamSegmentsByID( streamPublicID, segmentID )
		}
		else 
		{
			const rows = await this.selectStreamSegmentsFromRandomOrStart( streamPublicID, type )

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
					$segmentURL: segmentURL
				} )
		}
		catch ( e )
		{
			// TODO: log error

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

	public async getConnectedHubs( streamPublicID: string ): Promise<Hub[]>
	{
		const hubs: Hub[] = []

		try 
		{
			const rows = this.db.query(
				`SELECT hubID, hubURL, streamPublicID FROM hubs WHERE streamPublicID = $streamPublicID;`,
				{ $streamPublicID: streamPublicID }
			)

			for ( const row of rows ) 
			{
				if ( row )
					hubs.push( { hubID: row[ 0 ], hubURL: row[ 1 ], streamPublicID: row[ 2 ] } )
			}

			return hubs
		}
		catch ( e )
		{
			// TODO: log error

			throw Error( `Could not get hubs for stream.` )
		}
	}

	public async connectHubToStream( hubID: string, hubURL: URL, streamPublicID: string ): Promise<void>
	{
		try
		{
			this.db.query( `INSERT INTO hubs VALUES ($hubID, $hubURL, $streamPublicID);`, {
				$hubID: hubID,
				$hubURL: hubURL.toString(),
				$streamPublicID: streamPublicID
			} )
		}
		catch ( e )
		{
			throw Error( `Failed to add hub URL to stream.` )
		}
	}

	public async disconnectHubFromStream( hubID: string, streamPublicID: string ): Promise<void>
	{
		try
		{
			this.db.query(
				`DELETE FROM hubs WHERE hubID = $hubID AND streamPublicID = $streamPublicID;`,
				{
					$hubID: hubID,
					$streamPublicID: streamPublicID
				}
			)
		}
		catch ( e )
		{
			throw Error( `Failed to remove hub URL from stream.` )
		}
	}
}