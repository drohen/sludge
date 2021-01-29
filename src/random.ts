import { nanoid } from "https://deno.land/x/nanoid/async.ts"
import type { RandomProvider } from "./core.ts"

export class Random implements RandomProvider
{
	private randomStore: Uint32Array

	private cursor: number

	private storeState: `ready` | `updating`

	private uuidRegex: RegExp

	private uuidRegexStr: string

	/**
	 * Provider for randomness, generator of IDs and validation
	 * @param idLength Length of the id used for segments, streams
	 * @param randomStoreSize Number of IDs to pre-generate
	 */
	constructor(
		// no duplicates is important
		// security is less important
		// but 10 chars should be enough
		private idLength: number = 10,
		private randomStoreSize: number = 16384
	)
	{
		this.randomStore = new Uint32Array( this.randomStoreSize )

		this.cursor = 0

		this.uuidRegexStr = `[A-Za-z0-9-_]{${this.idLength}}`

		this.uuidRegex = new RegExp( `^${this.uuidRegexStr}$` )

		this.storeState = `ready`

		this.updateStore()
	}

	private updateStore()
	{
		this.storeState = `updating`

		crypto.getRandomValues( this.randomStore )

		this.cursor = 0

		this.storeState = `ready`
	}

	private waitForStoreReady(): Promise<void>
	{
		return new Promise( resolve =>
		{
			if ( this.storeState === `ready` )
			{
				resolve()
			}

			const interval = setInterval( () =>
			{
				if ( this.storeState === `ready` )
				{
					clearInterval( interval )

					resolve()
				}
			}, 2 )
		} )
	}

	private _random( min: number, max: number ): Promise<number>
	{
		return new Promise( resolve =>
		{
			const value = ( this.randomStore[ this.cursor ] % ( max - min ) ) + min
	
			resolve( value )
	
			this.cursor += 1

			if ( this.cursor >= this.randomStoreSize )
			{
				this.updateStore()
			}
		} )
	}

	public async random( min: number, max: number ): Promise<number>
	{
		await this.waitForStoreReady()

		return await this._random( min, max )
	}

	public validateUUID( uuid: string ): boolean
	{
		return this.uuidRegex.test( uuid )
	}

	public async uuid(): Promise<string>
	{
		return await nanoid( this.idLength )
	}

	public regexStr(): string
	{
		return this.uuidRegexStr
	}
}