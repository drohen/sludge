import { Core } from "./core.ts"
import * as path from "https://deno.land/std/path/mod.ts"
import * as fs from "https://deno.land/std/fs/mod.ts"
import { parse, Args } from "https://deno.land/std/flags/mod.ts"
import { Configure } from "./configure.ts"
import { cli } from "./cliHelp.ts"


class Sludge
{
	private core?: Core

	private config?: Configure

	private cli: string

	public static init()
	{
		try 
		{
			new Sludge()
		}
		catch ( e )
		{
			console.error( e )

			console.log( `Try: deno run src/sludge.ts --help` )
		}
	}

	constructor()
	{
		this.cli = cli

		this.parseArgs()
			.then( () =>
			{
				if ( this.core )
				{
					this.core.run()
				}
				else if ( this.config )
				{
					return this.config.generate()
				}
			} )
			.catch( ( e ) =>
			{
				console.error( e )

				console.log( `Try: deno run src/sludge.ts --help` )
			} )
	}

	private printAPI()
	{
		console.log( this.cli )
	}

	/**
	 * Generate nginx/system files based on provided config flags
	 * 
	 * This function will parse the given flags, it will error on
	 * and incorrect type or value.
	 * 
	 * Test mode will just output config file
	 * Development mode will create a local nginx server
	 * Production mode will create a system service
	 * 
	 * @param flags flags passed at CLI, see cliHelp.ts for information
	 */
	private async configure( flags: Args )
	{
		const reqArgs: string[] = [
			`nginx`,
			`host`,
			`port`,
			`cache`,
			`dir` ]

		const flagKeys: string[] = Object.keys( flags )

		const invalidArgs: string[] = reqArgs.reduce<string[]>( ( p, a ) => 
		{
			if ( !flagKeys.includes( a ) ) 
			{
				p.push( `Missing arg: ${a}` )
			}

			return p
		}, [] )

		if ( invalidArgs.length ) 
		{
			throw Error( invalidArgs.join( `\n` ) )
		}

		const environment = flags.test
			? `test`
			: flags.production
				? `production`
				: `development`

		const idLength = flags.idLength ? parseInt( flags.idLength, 10 ) : undefined

		if ( idLength !== undefined && isNaN( idLength ) )
		{
			throw Error( `ID Length ${idLength} is not a number.` )
		}

		const nginxPort = parseInt( flags.nginx )

		if ( isNaN( nginxPort ) )
		{
			throw Error( `nginx port ${nginxPort} is not a number` )
		}

		const port = parseInt( flags.port, 10 )

		if ( isNaN( port ) )
		{
			throw Error( `sludge server port ${port} is not a number.` )
		}

		const rootDir: string = flags.dir

		const cache = parseInt( flags.cache, 10 )

		if ( isNaN( cache ) )
		{
			throw Error( `cache days ${cache} is not a number.` )
		}

		const publicURL = flags.public ? this.validateURL( flags.public ) : undefined

		const fileURL = flags.files ? this.validateURL( flags.files ) : undefined

		if ( environment === `production` )
		{
			let fail = false

			if ( !publicURL )
			{
				console.log( `Missing arg: public, required for production` )

				fail = true
			}

			if ( !fileURL )
			{
				console.log( `Missing arg: files, required for production` )

				fail = true
			}

			if ( !idLength )
			{
				console.log( `Missing arg: idLength, required for production` )

				fail = true
			}

			if ( !flags.idAlphabet )
			{
				console.log( `Missing arg: idAlphabet, required for production` )

				fail = true
			}

			if ( fail ) throw Error()
		}
		
		this.config = new Configure(
			environment,
			nginxPort,
			flags.host,
			port,
			rootDir,
			cache,
			idLength,
			flags.idAlphabet,
			flags.conf,
			flags.service,
			fileURL,
			publicURL
		)
	}

	private async server( flags: Args )
	{
		const reqArgs: string[] = [
			`dir`,
			`port`,
			`public`,
			`files`,
			`idLength`,
			`idAlphabet` ]

		const flagKeys: string[] = Object.keys( flags )

		const invalidArgs: string[] = reqArgs.reduce<string[]>( ( p, a ) => 
		{
			if ( !flagKeys.includes( a ) ) 
			{
				p.push( `Missing arg: ${a}` )
			}

			return p
		}, [] )

		if ( invalidArgs.length ) 
		{
			throw Error( invalidArgs.join( `\n` ) )
		}

		const rootDir: string = flags.dir

		const audioDir: string = path.join( rootDir, `audio` )

		if ( !await fs.exists( audioDir ) )
		{
			await Deno.mkdir( audioDir, { recursive: true } )
		}

		// use db file for sqlite db
		const dbPath: string = path.join( rootDir, `db` )

		if ( !await fs.exists( dbPath ) ) 
		{
			await Deno.create( dbPath )
		}

		const publicURL = this.validateURL( flags.public )

		const fileURL = this.validateURL( flags.files )

		const port = parseInt( flags.port, 10 )

		if ( isNaN( port ) )
		{
			throw Error( `Port ${port} is not a number.` )
		}

		const idLength = parseInt( flags.idLength, 10 )

		if ( isNaN( idLength ) )
		{
			throw Error( `ID Length ${idLength} is not a number.` )
		}

		this.core = new Core(
			publicURL,
			port,
			rootDir,
			dbPath,
			fileURL,
			idLength,
			flags.idAlphabet
		)
	}

	private validateURL( url: string ): URL
	{
		return new URL( url )
	}

	/**
	 * Decide whether to generate config or run server
	 */
	public async parseArgs()
	{
		const flags: Args = parse( Deno.args )

		if ( flags.help )
		{
			this.printAPI()
		}
		else if ( flags.configure )
		{
			await this.configure( flags )
		}
		else
		{
			await this.server( flags )
		}
	}
}

Sludge.init()