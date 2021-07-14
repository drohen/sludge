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

	private selectLatest: string

	private segmentCount: Record<string, number>

	constructor(
		private db: sqlite.DB,
		private random: DBActionsProvider
	)
	{
		this.emptyList = []

		// This is here simply to reduce line length
		this.streamSelect = [
			`SELECT segmentID, streamPublicID, segmentURL FROM segments`,
			`WHERE streamPublicID = $streamPublicID AND rowid >`,
			`(SELECT rowid FROM segments WHERE segmentID = $segmentID AND streamPublicID = $streamPublicID)`,
			`LIMIT 10;`
		].join( ` ` )

		this.selectLatest = [
			`SELECT * FROM (SELECT segmentID, streamPublicID, segmentURL FROM segments WHERE`,
			`streamPublicID = $streamPublicID ORDER BY rowid DESC LIMIT 10) ORDER BY rowid ASC;`
		].join( ` ` )

		this.segmentCount = {}

		this.init()
	}

	/**
	 * Fn to reduce code repitition and help creating tables
	 * @param table table name
	 * @param values column names
	 */
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

	/**
	 * Return up to 10 segments following the provided segment ID
	 * @param streamPublicID 
	 * @param segmentID 
	 */
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

	/**
	 * Returns list of segments, starting from a random segment in all segments
	 * @param streamPublicID 
	 */
	private async getStreamsSegmentsRandom( streamPublicID: string )
	{
		const count = this.streamCount( streamPublicID )

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

	/**
	 * Returns most recent segments, up to 10 items
	 * @param streamPublicID 
	 */
	private async getStreamsSegmentsLatest( streamPublicID: string )
	{
		try 
		{
			return this.db.query(
				this.selectLatest,
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

	/**
	 * Return list of segments from start, up to 10 items
	 * @param streamPublicID 
	 */
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

	/**
	 * Count total segments for stream
	 * @param streamPublicID 
	 */
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

	/**
	 * Get segment list based on request type
	 * @param streamPublicID 
	 * @param type 
	 */
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

	/**
	 * Return formatted list of segments
	 * @param streamPublicID 
	 * @param segmentID 
	 * @param type random, start, latest
	 */
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

	/**
	 * Return stream info
	 * @param adminID 
	 */
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

	/**
	 * Create a new stream entry
	 * @param publicID Id used for request segments
	 * @param adminID Id used for posting segments
	 */
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

	/**
	 * Add entry for a segment URL location
	 * Segments will be returned in their insert order when requested
	 * @param segmentID 
	 * @param streamPublicID 
	 * @param segmentURL 
	 */
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

	/**
	 * Get a public ID from an admin ID
	 * @param adminID 
	 */
	public async getStreamPublicIDFromStreamAdminID( adminID: string ): Promise<string>
	{
		const stream = await this.getStream( adminID )

		if ( !stream || !stream.publicID ) 
		{
			throw Error( `Stream not found.` )
		}

		return stream.publicID
	}

	public streamCount( streamPublicID: string ): number
	{
		if ( this.segmentCount[ streamPublicID ] === undefined )
		{
			this.segmentCount[ streamPublicID ] = this.streamSegmentsCount( streamPublicID )
		}
		
		return this.segmentCount[ streamPublicID ]
	}

	/**
	 * Get the next segment ID for a stream
	 * @param streamPublicID 
	 */
	public nextSegmentID( streamPublicID: string ): string
	{
		const count = this.streamCount( streamPublicID )

		const id = `${count}`.padStart( 8, `0` )
		
		this.segmentCount[ streamPublicID ] = count + 1

		return id
	}
}