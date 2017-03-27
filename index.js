require('dotenv').config( { silent : true } );

const spawn = require('child_process').spawn;

const debug = require('debug')('elastic-archives:index');
const fs = require('fs');
const walk = require('walk');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const rws = require('remove-whitespace');
const argv = require('yargs').argv;

process.stdin.resume();

let ES = undefined;

if(argv.source === undefined){
	debug('No SOURCE')
	process.exit();
} else {
	
	const ESDestination = `${__dirname}/bin/elasticsearch-5.2.2/bin/elasticsearch`;
	
	debug('SOURCE:', argv.source);
	debug('Starting ES', ESDestination);

	ES = spawn(`${__dirname}/bin/elasticsearch-5.2.2/bin/elasticsearch`,
		{
			shell : true,
			detached : false
		}
	);

	ES.stdout.on('data', (data) => {
		console.log(`stdout: ${data}`);
	});

	ES.stderr.on('data', (data) => {
		console.log(`stderr: ${data}`);
	});

	ES.on('close', (code) => {
		console.log(`child process exited with code ${code}`);
		if(code === 1){
			// process.exit();
		}
	});

	ES.on('error', err => {
		debug('SPAWN ERROR:', err);
	});

}

const XMLFilePaths = [];

const walker = walk.walk(argv.source, {
	filters : ['.DS_Store']
});

walker.on("file", function (root, fileStats, next) {

	if(fileStats.name.indexOf('.xml') > -1){
		XMLFilePaths.push(`${root}/${fileStats.name}`);
	}
	
	next();
});

walker.on("end", function () {

	debug(`Walk complete. Waiting 10 secs before sending to ES`);

	setTimeout(function(){	

		console.log(`Preparing to send to ES`);

		function sendArticlesAway(item){

			/*return new Promise( resolve => {
				console.log('Waiting 5 seconds');
				setTimeout(function(){
					resolve();
				}, 5000);
			} )*/

			return fetch(`http://127.0.0.1:9200/articles/${item.id}`, {
					method : 'PUT',
					headers : {
						'Content-Type' : 'application/json'
					},
					body : JSON.stringify(item)
				})
				.then(res => {
					if(res.ok){
						console.log('Item saved successfully');
					} else {
						throw res;
					}
				})
				.catch(err => {
					console.log('failed');
					return 'failed';
				})
			;

		}
		
		function getArticlesFromFile(filePath){

			console.log('Getting:', filePath);
			return new Promise( resolve => {

				let $ = cheerio.load(fs.readFileSync(filePath, 'utf8'));

				async function iterateThroughArticles(articles){

					for(var x = 0; x < articles.length; x += 1){

						const id = $(articles[x]).children('ci').first().text();
						const text = rws( $(articles[x]).children('text').text().replace(/\s/g, '') );
						await sendArticlesAway(id, text);

					}

				}

				const listOfArticles = Array.from( $('article') );

				iterateThroughArticles(listOfArticles)
					.then(function(){
						resolve();
					})
				;

			});

		}

		async function workThroughFiles(list) {

			for (const file of list){
				try {
					await getArticlesFromFile(file);
				} catch (error) {
					console.error(error);
				}
			}

		}

		workThroughFiles(XMLFilePaths).then(function(){
			console.log('All finished', results.length);
		});

	}, 10000);

});