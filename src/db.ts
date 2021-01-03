import type * as sqlite from "https://deno.land/x/sqlite/mod.ts"
import type { Hub } from "./hubHandler.ts"
import type { DataProvider } from "./main.ts"
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
		 * id -> public access id for playlist/audio files
		 * alias -> secret id for uploads/ streaming
		 * created -> datetime stream was generated
		 */
		this.db.query(
			this.createTableQuery(
				`streams`,
				[
					[ `id`, DataType.string ],
					[ `alias`, DataType.string ],
					[ `created`, DataType.int ]
				]
			),
			[]
		)
	
		/**
		 * id -> id returned from hub for future delete req
		 * url -> hub url for finding the stream
		 * streamID -> id of linked stream
		 */
		this.db.query(
			this.createTableQuery(
				`hubs`,
				[
					[ `url`, DataType.string ],
					[ `streamID`, DataType.string ]
				]
			),
			[]
		)
	
		/**
		 * id -> id for audio file segment retrieval
		 * streamID -> id of linked stream
		 * url -> public url for file request
		 */
		this.db.query(
			this.createTableQuery(
				`segments`,
				[
					[ `id`, DataType.string ],
					[ `streamID`, DataType.string ],
					[ `url`, DataType.string ]
				]
			),
			[]
		)
	}

	private getStreamSegmentsByID( streamID: string, segmentID: string )
	{
		const segments: Segment[] = []

		try 
		{
			const rows = this.db.query(
				`SELECT id, streamID, url FROM segments WHERE streamID = $streamID AND rowid > (SELECT rowid FROM segments WHERE id = $segmentID) LIMIT 10;`,
				{
					$segmentID: segmentID,
					$streamID: streamID
				}
			)
	
			for ( const row of rows ) 
			{
				if ( row ) 
				{
					const [ id, streamID, url ] = row
	
					segments.push( { id, streamID, url } )
				}
			}
	
			return segments
		}
		catch ( e )
		{
			throw Error( `Could not get segments for stream.` )
		}
	}

	private async getStreamsSegmentsRandom( streamID: string )
	{
		const count = this.streamSegmentsCount( streamID )

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
				`SELECT id, streamID, url FROM segments WHERE streamID = $streamID LIMIT 10 OFFSET $offset;`,
				{
					$streamID: streamID,
					$offset: offset
				}
			)
		}
		catch ( e )
		{
			throw Error( `Could not get segments for stream.` )
		}
	}

	private getStreamSegmentsStart( streamID: string )
	{
		try 
		{
			return this.db.query(
				`SELECT id, streamID, url FROM segments WHERE streamID = $streamID LIMIT 10;`,
				{
					$streamID: streamID
				}
			)
		}
		catch ( e )
		{
			throw Error( `Could not get segments for stream.` )
		}
	}

	private streamSegmentsCount( streamID: string )
	{
		const count = this.db.query(
			`SELECT COUNT(*) FROM segments WHERE streamID = $streamID;`,
			{
				$streamID: streamID
			}
		)

		if ( !count ) 
		{
			return 0
		}

		const value = count.next().value

		return value && value[ 0 ] ? value[ 0 ] : 0
	}

	private async selectStreamSegmentsFromRandomOrStart( streamID: string, type: `random` | `start` = `random` )
	{
		switch( type )
		{
			case `start`:

				return this.getStreamSegmentsStart( streamID )

			case `random`:

				return await this.getStreamsSegmentsRandom( streamID )

		}
	}

	public async getSegmentList( streamID: string, segmentID?: string, type: `random` | `start` = `random` ): Promise<Segment[]>
	{
		if ( segmentID ) 
		{
			// if segment id, return all after segment ID
			return this.getStreamSegmentsByID( streamID, segmentID )
		}
		else 
		{
			const rows = await this.selectStreamSegmentsFromRandomOrStart( streamID, type )

			const segments: Segment[] = []

			for ( const row of rows ) 
			{
				if ( row ) 
				{
					const [ id, streamID, url ] = row

					segments.push( { id, streamID, url } )
				}
			}

			return segments
		}
	}

	public async getStream( streamAlias: string ): Promise<Stream>
	{
		const rows = this.db.query(
			`SELECT id, alias, created FROM streams WHERE alias = $alias;`,
			{ $alias: streamAlias }
		)

		for ( const row of rows ) 
		{
			if ( row ) 
			{
				return {
					id: row[ 0 ],
					alias: row[ 1 ],
					created: row[ 2 ]
				}
			}
		}

		throw Error( `Stream not found.` )
	}

	public async createStream( id: string, streamAlias: string ): Promise<Stream>
	{
		try 
		{	
			this.db.query( 
				`INSERT INTO streams VALUES ($id, $alias, $created);`, 
				{
					$id: id,
					$alias: streamAlias,
					$created: Date.now()
				} )
		}
		catch ( e )
		{
			// TODO: log error

			throw Error( `Failed to create stream.` )
		}

		const stream = await this.getStream( streamAlias )

		if ( !stream )
		{
			throw Error( `Could not create stream.` )
		}

		return stream
	}

	public async addSegmentURL( id: string, streamID: string, url: URL ): Promise<void>
	{
		try 
		{
			this.db.query( 
				`INSERT INTO segments VALUES ($id, $streamID, $url);`, 
				{
					$id: id,
					$streamID: streamID,
					$url: url
				} )
		}
		catch ( e )
		{
			// TODO: log error

			throw Error( `Failed to add segment.` )
		}
	}

	public async getIDFromStreamAlias( streamAlias: string ): Promise<string>
	{
		const stream = await this.getStream( streamAlias )

		if ( !stream || !stream.id ) 
		{
			throw Error( `Stream not found.` )
		}

		return stream.id
	}

	public async getConnectedHubs( streamID: string ): Promise<Hub[]>
	{
		const hubs: Hub[] = []

		try 
		{
			const rows = this.db.query(
				`SELECT url, streamID FROM hubs WHERE streamID = $streamID;`,
				{ $streamID: streamID }
			)

			for ( const row of rows ) 
			{
				if ( row )
					hubs.push( { url: row[ 0 ], streamID: row[ 1 ] } )
			}

			return hubs
		}
		catch ( e )
		{
			// TODO: log error

			throw Error( `Could not get hubs for stream.` )
		}
	}

	public async connectHubToStream( streamID: string, hubURL: URL ): Promise<void>
	{
		try
		{
			this.db.query( `INSERT INTO hubs VALUES ($url, $streamID);`, {
				$url: hubURL.toString(),
				$streamID: streamID
			} )
		}
		catch ( e )
		{
			throw Error( `Failed to add hub URL to stream.` )
		}
	}

	public async disconnectHubFromStream( streamID: string, hubURL: URL ): Promise<void>
	{
		try
		{
			this.db.query(
				`DELETE FROM hubs WHERE id = $id AND streamID = $streamID;`,
				{
					$id: hubURL.toString(),
					$streamID: streamID
				}
			)
		}
		catch ( e )
		{
			throw Error( `Failed to remove hub URL from stream.` )
		}
	}
}