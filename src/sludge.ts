import { Core } from "./core.ts"
import * as path from "https://deno.land/std/path/mod.ts"
import * as fs from "https://deno.land/std/fs/mod.ts"
import { parse, Args } from "https://deno.land/std/flags/mod.ts"
import { Configure } from "./configure.ts"
import { Random } from "./random.ts"

const cli = `
sludge CLI

deno run src/sludge.ts { arguments }

Arguments:
	
	--development		Development mode for local deployment (default)
	
	--test			Test mode for generating files without running server
	
	--production		Production mode for running sludge on a server
	
	--dir="<file path>"	Set directory for saving files, e.g. ~/.sludge
	
	--port="<port>"		Port for running sludge app, e.g. 8080
	
	--public="<url>"	URL for accessing sludge API, e.g. https://ga.ge/
	
	--files="<url>"		URL for accessing sludge audio, e.g. https://ga.ge/audio/

	--configure		Generate templates for nginx and system services to run server
				Development mode will work on Linux / OS X and only run nginx
				Test mode will only output configuration files
				Production mode works only on Linux and run nginx and systemd services
	
	--nginx="<port>"	Port that nginx will be exposed on, e.g. 80
	
	--host="<host/ip>"	Address that will be used to access nginx, e.g. ga.ge
	
	--cache="<days>"	Number of days to cache audio files, e.g. 30
	
	--name="<file name>"	Name of nginx configuration file, default is sludge_nginx.conf
	
	--help			Show this information screen
`

class Sludge
{
	private core?: Core

	private config?: Configure

	public static init()
	{
		try 
		{
			new Sludge()
		}
		catch ( e )
		{
			// Need better error/logging system
			console.error( e )

			console.log( `Try: deno run src/sludge.ts --help` )
		}
	}

	constructor()
	{
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
				// Need better error/logging system
				console.error( e )

				console.log( `Try: deno run src/sludge.ts --help` )
			} )
	}

	private printAPI()
	{
		console.log( cli )
	}

	private async configure( flags: Args )
	{
		const reqArgs: string[] = [ `nginx`, `host`, `port`, `cache`, `dir` ]

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

		const random = new Random( undefined, 0 )

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

		const audioDir: string = path.join( rootDir, `audio` )

		if ( !await fs.exists( audioDir ) ) 
		{
			await Deno.mkdir( audioDir, { recursive: true } )
		}

		const cache = parseInt( flags.cache, 10 )

		if ( isNaN( cache ) )
		{
			throw Error( `cache days ${cache} is not a number.` )
		}

		const publicURL = flags.public ? this.validateURL( flags.public ) : undefined

		const fileURL = flags.files ? this.validateURL( flags.files ) : undefined
		
		this.config = new Configure(
			environment,
			random.regexStr(),
			nginxPort,
			flags.host,
			port,
			rootDir,
			cache,
			flags.name,
			fileURL,
			publicURL
		)
	}

	private async server( flags: Args )
	{
		const reqArgs: string[] = [ `dir`, `port`, `public`, `files` ]

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

		this.core = new Core(
			publicURL,
			port,
			rootDir,
			dbPath,
			fileURL
		)
	}

	private validateURL( url: string ): URL
	{
		return new URL( url )
	}

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