import { join } from "https://deno.land/std/path/mod.ts"

const nginxTemplate = (
	port: number, 
	serverName: string, 
	sludgePort: number,
	cacheAgeSeconds: number,
	rootFilePath: string
) => `server
{
	listen					${port};

	server_name				${serverName};
	
	gzip					on;
	
	gzip_types				text/plain application/xml;


	# adminID/publicID path handling (multipart form post segment, playlist get)

	location ~ "^/[a-zA-Z0-9_-]{10,}" 
	{
		proxy_pass			http://127.0.0.1:${sludgePort};

		proxy_set_header Host		$host;

		proxy_set_header X-Real-IP	$remote_addr;
	}


	# stream create
    
	location /stream 
	{
		proxy_pass			http://127.0.0.1:${sludgePort}/stream;

		proxy_set_header Host		$host;

		proxy_set_header X-Real-IP	$remote_addr;
	}


	# audio files
    
	location ~ "^/audio/([a-zA-Z0-9_-]{10,})/([a-zA-Z0-9_-]{1,}\\.opus)$" 
	{
		add_header 			'Access-Control-Allow-Origin' '*';

		add_header 			'Access-Control-Allow-Methods' 'GET, OPTIONS';

		add_header 			'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range';

		add_header 			'Access-Control-Expose-Headers' 'Content-Length,Content-Range';

		add_header 			'Cache-Control' 'public, max-age=${cacheAgeSeconds}, immutable';

		alias				${rootFilePath}/audio/$1/$2;
	}
}`

const serviceTemplate = (
	user: string,
	projectPath: string,
	filesURL: string,
	publicURL: string,
	sludgePort: number,
	sludgeDir: string,
	idLength: number,
	idAlphabet: string
) => `[Unit]
Description=sludge server
After=network.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${projectPath}
Environment="SLUDGE_FILES=${filesURL}"
Environment="SLUDGE_PUBLIC=${publicURL}"
Environment="SLUDGE_PORT=${sludgePort}"
Environment="SLUDGE_DIR=${sludgeDir}"
Environment="ID_LENGTH=${idLength}"
Environment="ID_ALPHABET=${idAlphabet}"
ExecStart=/usr/bin/make run
Restart=on-failure

[Install]
WantedBy=multi-user.target`

export class Configure
{
	private nginxPath: string

	private cacheAgeSeconds: number

	private servicePath: string

	/**
	 * Builds and outputs the configuration files to serve the app
	 * 
	 * @param environment indicate to output config file (test), run locally (development) or deploy (production)
	 * @param nginxPort port to run and access nginx server
	 * @param serverName IP/domain to access nginx server
	 * @param sludgePort port where sludge server will be run
	 * @param rootFilePath path to where files are stored on the machine
	 * @param idLength number of chars in the ID
	 * @param idAlphabet characters to be used in the ID
	 * @param cacheAgeDays length in days to preserve audio file cache
	 * @param nginxConfFileName file name to save the nginx config file under
	 * @param serviceFileName file name to save the systemd file under
	 * @param filesURL URL/path where the audio files will be accessed
	 * @param publicURL URL/path where the app will be accessed
	 */
	constructor(
		private environment: `test` | `development` | `production` = `development`,
		private nginxPort: number,
		private serverName: string,
		private sludgePort: number,
		private rootFilePath: string,
		cacheAgeDays: number,
		private idLength?: number,
		private idAlphabet?: string,
		nginxConfFileName = `sludge_nginx`,
		private serviceFileName = `sludge_server`,
		private filesURL?: URL,
		private publicURL?: URL
	)
	{
		this.nginxPath = this.environment === `test`
			? join( rootFilePath, `${nginxConfFileName}.conf` )
			: Deno.build.os === `linux`
				? join( `/etc/nginx/sites-enabled`, `${nginxConfFileName}.conf` )
				: join( `/usr/local/etc/nginx/servers`, `${nginxConfFileName}.conf` )

		this.servicePath = `/etc/systemd/system/${this.serviceFileName}.service`

		this.cacheAgeSeconds = cacheAgeDays * 24 * 60 * 60
	}

	/**
	 * Just write the nginx config file
	 */
	private async test()
	{
		console.log( `Writing file to`, this.nginxPath )

		const nginx = nginxTemplate(
			this.nginxPort,
			this.serverName,
			this.sludgePort,
			this.cacheAgeSeconds,
			this.rootFilePath
		)
		
		await Deno.writeTextFile( this.nginxPath, nginx )

		console.log( nginx )
	}

	/**
	 * Restart nginx
	 * @param type OS environment
	 */
	private async restartService( type: `osx` | `linux` )
	{
		// Restart nginx to enable conf file
		const cmd = type === `osx`
			? [ `brew`, `services`, `restart`, `nginx`  ]
			: [ `sudo`, `service`, `nginx`, `restart`  ]

		const p = Deno.run( { cmd } )

		const { code } = await p.status()

		if ( code !== 0 )
		{
			throw Error( `Error restarting nginx` )
		}

		p.close()
	}

	/**
	 * Create development config and start server
	 */
	private async development()
	{
		console.log( `Writing file to`, this.nginxPath )

		const template = nginxTemplate(
			this.nginxPort,
			this.serverName,
			this.sludgePort,
			this.cacheAgeSeconds,
			this.rootFilePath
		)
		
		switch ( Deno.build.os )
		{
			case `darwin`:

				await Deno.writeTextFile( this.nginxPath, template )

				await this.restartService( `osx` )

				break

			case `linux`:

				await Deno.writeTextFile( this.nginxPath, template )

				await this.restartService( `linux` )

				break

			default:

				throw Error( `Unknown OS: No support for ${Deno.build.os}` )
		}
	}

	/**
	 * Create production config and start service
	 */
	private async production()
	{
		if ( Deno.build.os !== `linux` )
		{
			throw Error( `Production only available for linux. No support for ${Deno.build.os}` )
		}
		
		console.log( `Writing file to`, this.nginxPath )

		await Deno.writeTextFile( 
			this.nginxPath, 
			nginxTemplate(
				this.nginxPort,
				this.serverName,
				this.sludgePort,
				this.cacheAgeSeconds,
				this.rootFilePath
			) )

		await this.restartService( `linux` )

		const user = Deno.env.get( `SUDO_USER` ) ?? Deno.env.get( `USER` )

		if ( !user )
		{
			throw Error( `Could not get user from $USER env var.` )
		}

		if ( !this.filesURL )
		{
			throw Error( `Files URL required for production.` )
		}

		if ( !this.publicURL )
		{
			throw Error( `Public URL required for production.` )
		}

		if ( !this.idLength )
		{
			throw Error( `ID length required for production.` )
		}

		if ( !this.idAlphabet )
		{
			throw Error( `ID Alphabet required for production.` )
		}

		console.log( `Writing file to`, this.servicePath )
		
		await Deno.writeTextFile( 
			this.servicePath, 
			serviceTemplate(
				user,
				Deno.cwd(),
				this.filesURL.toString(),
				this.publicURL.toString(),
				this.sludgePort,
				this.rootFilePath,
				this.idLength,
				this.idAlphabet
			) )

		const p0 = Deno.run( { cmd: [ `sudo`, `systemctl`, `start`, this.serviceFileName ] } )

		const { code: code0 } = await p0.status()

		if ( code0 !== 0 )
		{
			throw Error( `Error starting service` )
		}

		p0.close()

		const p1 = Deno.run( { cmd: [ `sudo`, `systemctl`, `enable`, this.serviceFileName ] } )

		const { code: code1 } = await p1.status()

		if ( code1 !== 0 )
		{
			throw Error( `Error enabling service` )
		}

		p1.close()
	}

	/**
	 * This needs to be called to output the config and (optionally) run nginx/service
	 */
	public async generate(): Promise<void>
	{
		switch( this.environment )
		{
			case `development`:

				return void await this.development()

			case `production`:

				return void await this.production()

			case `test`:

				return void await this.test()

			default:

				throw Error( `Unknown environment: No support for ${this.environment}` )
		}
	}
}