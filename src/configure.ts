import { join } from "https://deno.land/std/path/mod.ts"

const nginxTemplate = (
	port: number, 
	serverName: string, 
	sludgePort: number, 
	streamIDRegex: string, 
	segmentFileRegex: string,
	cacheAgeSeconds: number,
	rootFilePath: string
) => `server
{
	listen					${port};

	server_name				${serverName};
	
	gzip					on;
	
	gzip_types				text/plain application/xml;


	# adminID/publicID path handling (multipart form post segment, playlist get)

	location ~ "^/${streamIDRegex}" 
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
    
	location ~ "^/audio/(${streamIDRegex})/(${segmentFileRegex})$" 
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
	sludgePort: number
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
ExecStart=/usr/bin/make run
Restart=on-failure

[Install]
WantedBy=multi-user.target`

export class Configure
{
	private nginxPath: string

	private segmentFileRegex: string

	private cacheAgeSeconds: number

	private servicePath: string

	/**
	 * Builds and outputs the configuration files to serve the app
	 * 
	 * @param environment indicate to output config file (test), run locally (development) or deploy (production)
	 * @param regexStr string to validate file/stream URLs
	 * @param nginxPort port to run and access nginx server
	 * @param serverName IP/domain to access nginx server
	 * @param sludgePort port where sludge server will be run
	 * @param rootFilePath path to where files are stored on the machine
	 * @param cacheAgeDays length in days to preserve audio file cache
	 * @param nginxConfFileName file name to save the nginx config file under
	 * @param filesURL URL/path where the audio files will be accessed
	 * @param publicURL URL/path where the app will be accessed
	 */
	constructor(
		private environment: `test` | `development` | `production` = `development`,
		private regexStr: string,
		private nginxPort: number,
		private serverName: string,
		private sludgePort: number,
		private rootFilePath: string,
		cacheAgeDays: number,
		nginxConfFileName = `sludge_nginx.conf`,
		private filesURL?: URL,
		private publicURL?: URL
	)
	{
		this.nginxPath = this.environment === `test`
			? join( rootFilePath, nginxConfFileName )
			: Deno.build.os === `linux`
				? join( `/etc/nginx/sites-enabled`, nginxConfFileName )
				: join( `/usr/local/etc/nginx/servers`, nginxConfFileName )

		this.servicePath = `/etc/systemd/system/sludge_server.service`

		this.segmentFileRegex = `${this.regexStr}\\.opus`

		this.cacheAgeSeconds = cacheAgeDays * 24 * 60 * 60
	}

	/**
	 * Just write the nginx config file
	 */
	private async test()
	{
		console.log( `Writing file to`, this.nginxPath )
		
		await Deno.writeTextFile( 
			this.nginxPath, 
			nginxTemplate(
				this.nginxPort,
				this.serverName,
				this.sludgePort,
				this.regexStr,
				this.segmentFileRegex,
				this.cacheAgeSeconds,
				this.rootFilePath
			) )
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
			this.regexStr,
			this.segmentFileRegex,
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
				this.regexStr,
				this.segmentFileRegex,
				this.cacheAgeSeconds,
				this.rootFilePath
			) )

		await this.restartService( `linux` )

		const user = Deno.env.get( `USER` )

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

		console.log( `Writing file to`, this.servicePath )
		
		await Deno.writeTextFile( 
			this.servicePath, 
			serviceTemplate(
				user,
				Deno.cwd(),
				this.filesURL.toString(),
				this.publicURL.toString(),
				this.sludgePort
			) )

		const p0 = Deno.run( { cmd: [ `sudo`, `systemctl`, `start`, `sludge_server`  ] } )

		const { code: code0 } = await p0.status()

		if ( code0 !== 0 )
		{
			throw Error( `Error starting service` )
		}

		p0.close()

		const p1 = Deno.run( { cmd: [ `sudo`, `systemctl`, `enable`, `sludge_server`  ] } )

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