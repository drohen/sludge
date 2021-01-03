export interface Hub 
{
	url: string
	streamID: string
}

export interface HubDataProvider
{
	getIDFromStreamAlias: ( streamAlias: string ) => Promise<string>

	getConnectedHubs: ( streamID: string ) => Promise<Hub[]>

	connectHubToStream: ( streamID: string, hubURL: URL ) => Promise<void>

	disconnectHubFromStream: ( streamID: string, hubURL: URL ) => Promise<void>
}

export interface HubCoreProvider
{
	publicURL: () => URL
}

export class HubHandler
{
	constructor(
		private core: HubCoreProvider,
		private data: HubDataProvider
	)
	{}

	public async add( 
		hubURL: URL,
		streamAlias: string
	): Promise<void> 
	{
		// get stream id
		const streamID = await this.data.getIDFromStreamAlias( streamAlias )

		// ensure unique
		const hubs = await this.data.getConnectedHubs( streamID )

		const url = hubURL.toString()

		if ( hubs.find( ( hub: Hub ): boolean => hub.url === url ) !== undefined ) 
		{
			throw Error( `Hub ${url} already used by stream.` )
		}

		// send ping to hub to add playlist URL
		try
		{
			await fetch( 
				url, 
				{
					headers: {
						"Content-Type": `text/plain`
					},
					method: `PUT`,
					// why not encode?
					body: new URL( streamID, this.core.publicURL() ).toString()
				} )
		}
		catch ( e )
		{
			throw Error( `Failed to add hub URL to stream.` )
		}

		// TODO: does this work without await?
		this.data.connectHubToStream( streamID, hubURL )
	}

	/**
	 * It doesn't make sense to have a hub id for streams
	 * Only someone with admin access to a stream can add/delete it
	 * And the hub url always remains the same
	 */
	public async remove( url: URL, streamAlias: string ): Promise<void>
	{
		// get stream id
		const streamID = await this.data.getIDFromStreamAlias( streamAlias )

		// send ping to hub to rem playlist URL
		// TODO: handle if failed to remove
		try
		{
			await fetch( 
				url,
				{
					headers: {
						"Content-Type": `text/plain`
					},
					method: `DELETE`
				} )
		}
		catch ( e )
		{
			throw Error( `Failed to remove hub URL from stream.` )
		}

		// rem hub from hub list
		await this.data.disconnectHubFromStream( streamID, url )
	}

	// TODO: add docs
	public async get( streamAlias: string ): Promise<Hub[]> 
	{
		return await this.data.getConnectedHubs( await this.data.getIDFromStreamAlias( streamAlias ) )
	}
}