export interface Hub 
{
	hubID: string
	hubURL: string
	streamPublicID: string
}

export interface HubDataProvider
{
	getStreamPublicIDFromStreamAdminID: ( streamAdminID: string ) => Promise<string>

	getConnectedHubs: ( streamPublicID: string ) => Promise<Hub[]>

	connectHubToStream: ( hubID: string, hubURL: URL, streamPublicID: string ) => Promise<void>

	disconnectHubFromStream: ( hubID: string, streamPublicID: string ) => Promise<void>
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
		streamAdminID: string
	): Promise<void> 
	{
		// get stream id
		const streamPublicID = await this.data.getStreamPublicIDFromStreamAdminID( streamAdminID )

		// ensure unique
		const hubs = await this.data.getConnectedHubs( streamPublicID )

		const _hubURL = hubURL.toString()

		if ( hubs.find( ( hub: Hub ): boolean => hub.hubURL === _hubURL ) !== undefined ) 
		{
			throw Error( `Hub ${_hubURL} already used by stream.` )
		}

		// send ping to hub to add playlist URL
		try
		{
			const hubID = await fetch( 
				_hubURL, 
				{
					headers: {
						"Content-Type": `text/plain`
					},
					method: `PUT`,
					// why not encode?
					body: new URL( streamPublicID, this.core.publicURL() ).toString()
				} )
				.then( res => res.text() )

			if ( !hubID ) throw Error()

			// TODO: does this work without await?
			this.data.connectHubToStream( hubID, hubURL, streamPublicID )
		}
		catch ( e )
		{
			// TODO: log error

			throw Error( `Failed to add hub URL to stream.` )
		}
	}

	public async remove( hubID: string, streamAdminID: string ): Promise<void>
	{
		// get stream id
		const streamPublicID = await this.data.getStreamPublicIDFromStreamAdminID( streamAdminID )

		// ensure exists
		const hubs = await this.data.getConnectedHubs( streamPublicID )

		const hub: Hub | undefined = hubs.find( ( hub: Hub ): boolean => hub.hubID === hubID )

		if ( hub === undefined )
		{
			throw Error( `Hub ${hubID} does not exist.` )
		}

		// send ping to hub to rem playlist URL
		// TODO: handle if failed to remove
		// send ping to hub to rem playlist URL
		// TODO: handle if failed to remove
		try
		{
			await fetch( 
				hubID,
				{
					headers: {
						"Content-Type": `text/plain`
					},
					method: `DELETE`,
					body: new TextEncoder().encode( hub.hubID )
				} )
		}
		catch ( e )
		{
			throw Error( `Failed to remove hub URL from stream.` )
		}

		// rem hub from hub list
		await this.data.disconnectHubFromStream( hubID, streamPublicID )
	}

	// TODO: add docs
	public async get( streamAdminID: string ): Promise<Hub[]> 
	{
		return await this.data.getConnectedHubs( await this.data.getStreamPublicIDFromStreamAdminID( streamAdminID ) )
	}
}