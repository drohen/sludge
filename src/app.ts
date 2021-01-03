import { Main } from "./main.ts"
import * as path from "https://deno.land/std/path/mod.ts"
import * as fs from "https://deno.land/std/fs/mod.ts"
import { parse, Args } from "https://deno.land/std/flags/mod.ts"

class App
{
	private main?: Main

	public static init()
	{
		try 
		{
			new App()
		}
		catch ( e )
		{
			// Need better error/logging system
			console.error( e )
		}
	}

	constructor()
	{
		this.parseArgs().then( main =>
		{
			this.main = main
		} )
	}

	private validateURL( url: string ): URL
	{
		return new URL( url )
	}

	public async parseArgs()
	{
		const flags: Args = parse( Deno.args )

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

		if ( !fs.exists( dbPath ) ) 
		{
			await Deno.create( dbPath )
		}

		const publicURL = this.validateURL( flags.public )

		const fileURL = this.validateURL( flags.files )

		const port = Number( flags.port )

		return new Main(
			publicURL,
			port,
			rootDir,
			dbPath,
			fileURL
		)
	}
}

App.init()