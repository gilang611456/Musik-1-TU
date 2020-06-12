const http = require('http');
const express = require('express');
const app = express();
app.get("/", (request, response) => {
  console.log('Pinging');
  response.sendStatus(200);
});
app.listen(process.env.PORT);
setInterval(() => {
  http.get(`http://${process.env.PROJECT_DOMAIN}.glitch.me/`);
}, 280000);

const { Client, Util } = require('discord.js');
const { TOKEN, PREFIX, GOOGLE_API_KEY } = require('./config');
const YouTube = require('simple-youtube-api');
const ytdl = require('ytdl-core');

const client = new Client({ disableEveryone: true });

const youtube = new YouTube(GOOGLE_API_KEY);

const queue = new Map();

client.on('warn', console.warn);

client.on('error', console.error);

client.on('ready', () => console.log('Yo this ready!'));


client.on('disconnect', () => console.log('I just disconnected, making sure you know, I will reconnect now...'));

client.on('reconnecting', () => console.log('I am reconnecting now!'));


client.on('message', async msg => { // eslint-disable-line
	if (msg.author.bot) return undefined;
	if (!msg.content.startsWith(PREFIX)) return undefined;

	const args = msg.content.split(' ');
	const searchString = args.slice(1).join(' ');
	const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
	const serverQueue = queue.get(msg.guild.id);

	let command = msg.content.toLowerCase().split(' ')[0];
	command = command.slice(PREFIX.length)

	if (command === 'p') {
		const voiceChannel = msg.member.voiceChannel;
		if (!voiceChannel) return msg.channel.send('Kamu harus berada di dalam voice!');
		const permissions = voiceChannel.permissionsFor(msg.client.user);
		if (!permissions.has('CONNECT')) {
			return msg.channel.send('Saya tidak punya perizinan di voice itu!');
		}
		if (!permissions.has('SPEAK')) {
			return msg.channel.send('Saya Tidak punya perizinan untuk menyanyi di situ!');
		}

		if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
			const playlist = await youtube.getPlaylist(url);
			const videos = await playlist.getVideos();
			for (const video of Object.values(videos)) {
				const video2 = await youtube.getVideoByID(video.id); // eslint-disable-line no-await-in-loop
				await handleVideo(video2, msg, voiceChannel, true); // eslint-disable-line no-await-in-loop
			}
			return msg.channel.send(`✅ Daftar Musik: **${playlist.title}** telah di tambahkan di daftar lagu!`);
		} else {
			try {
				var video = await youtube.getVideo(url);
			} catch (error) {
				try {
					var videos = await youtube.searchVideos(searchString, 20);
					let index = 0;
					msg.channel.send(`
__**Musik Pilihan:**__
${videos.map(video2 => `**${++index} -** ${video2.title}`).join('\n')}
Pilih angka 1 sampai 20 untuk memutar musik.
					`);
					// eslint-disable-next-line max-depth
					try {
						var response = await msg.channel.awaitMessages(msg2 => msg2.content > 0 && msg2.content < 11, {
							maxMatches: 1,
							time: 20000,
							errors: ['time']
						});
					} catch (err) {
						console.error(err);
						return msg.channel.send('Pilih salah satu atau hangus.');
					}
					const videoIndex = parseInt(response.first().content);
					var video = await youtube.getVideoByID(videos[videoIndex - 1].id);
				} catch (err) {
					console.error(err);
					return msg.channel.send('🆘 Saya tidak bisa mencari Musik Itu.');
				}
			}
			return handleVideo(video, msg, voiceChannel);
		}
	} else if (command === 's') {
		if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel!');
		if (!serverQueue) return msg.channel.send('There is nothing playing that I could skip for you.');
		serverQueue.connection.dispatcher.end('Skip command has been used!');
		return undefined;
	} else if (command === 'h') {
		if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel!');
		if (!serverQueue) return msg.channel.send('There is nothing playing that I could stop for you.');
		serverQueue.songs = [];
		serverQueue.connection.dispatcher.end('Stop command has been used!');
		return undefined;
	} else if (command === 'vol') {
		if (!msg.member.voiceChannel) return msg.channel.send('Kamu harus berada di dalam channel voice!');
		if (!serverQueue) return msg.channel.send('Musik belom di putar mana bisa make command ini?.');
		if (!args[1]) return msg.channel.send(`Hamba tuhan telah Set Volume menjadi: **${serverQueue.volume}**`);
		serverQueue.volume = args[1];
		serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5);
		return msg.channel.send(`I set the volume to: **${args[1]}**`);
	} else if (command === 'np') {
		if (!serverQueue) return msg.channel.send('There is nothing playing.');
		return msg.channel.send(`🎶 Now playing: **${serverQueue.songs[0].title}**`);
	} else if (command === 'daftar') {
		if (!serverQueue) return msg.channel.send('Tidak ada daftar musik di sini.');
		return msg.channel.send(`
__**Daftar Lagu:**__
${serverQueue.songs.map(song => `**-** ${song.title}`).join('\n')}
**Sedang Di putar:** ${serverQueue.songs[0].title}
		`);
	} else if (command === 'jeda') {
		if (serverQueue && serverQueue.playing) {
			serverQueue.playing = false;
			serverQueue.connection.dispatcher.pause();
			return msg.channel.send('⏸ Musik telah Terjeda!');
		}
		return msg.channel.send('Musik belom di puter.');
	} else if (command === 'lanjut') {
		if (serverQueue && !serverQueue.playing) {
			serverQueue.playing = true;
			serverQueue.connection.dispatcher.resume();
			return msg.channel.send('▶ Musik telah di lanjutkan!');
		}
		return msg.channel.send('Musik belom di puter.');
	}

	return undefined;
});

async function handleVideo(video, msg, voiceChannel, playlist = false) {
	const serverQueue = queue.get(msg.guild.id);
	console.log(video);
	const song = {
		id: video.id,
		title: Util.escapeMarkdown(video.title),
		url: `https://www.youtube.com/watch?v=${video.id}`
	};
	if (!serverQueue) {
		const queueConstruct = {
			textChannel: msg.channel,
			voiceChannel: voiceChannel,
			connection: null,
			songs: [],
			volume: 5,
			playing: true
		};
		queue.set(msg.guild.id, queueConstruct);

		queueConstruct.songs.push(song);

		try {
			var connection = await voiceChannel.join();
			queueConstruct.connection = connection;
			play(msg.guild, queueConstruct.songs[0]);
		} catch (error) {
			console.error(`Saya gabisa Masuk channel oyy: ${error}`);
			queue.delete(msg.guild.id);
			return msg.channel.send(`Saya gabisa masuk di voice: ${error}`);
		}
	} else {
		serverQueue.songs.push(song);
		console.log(serverQueue.songs);
		if (playlist) return undefined;
		else return msg.channel.send(`✅ **${song.title}** Telah di berhasil tambahkan di daftar musik!`);
	}
	return undefined;
}

function play(guild, song) {
	const serverQueue = queue.get(guild.id);

	if (!song) {
		serverQueue.voiceChannel.leave();
		queue.delete(guild.id);
		return;
	}
	console.log(serverQueue.songs);

	const dispatcher = serverQueue.connection.playStream(ytdl(song.url))
		.on('end', reason => {
			if (reason === 'Stream is not generating quickly enough.') console.log('Song ended.');
			else console.log(reason);
			serverQueue.songs.shift();
			play(guild, serverQueue.songs[0]);
		})
		.on('error', error => console.error(error));
	dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);

	serverQueue.textChannel.send(`🎶 Memulai Musik: **${song.title}**`);

client.user.setActivity('🔴TEMPAT UMUM',{Type: 'PLAYING'})
}

client.login(TOKEN);

client.on('voiceStateUpdate' , (oldMember , newMember) => {
  
  const kategori = '666636937372893209'
  const voice = '718199412970619113'
  const voice2 = '718204421707923458'
  const voice3 = '718204907399938058'

  if(newMember.voiceChannelID === voice) {
    
    newMember.guild.createChannel(`${newMember.user.username}`, 'voice')
    .then(tempChannel => {
    tempChannel.setParent(kategori);
    newMember.setVoiceChannel(tempChannel.id);
    tempChannel.setUserLimit('2');
    })
    
    .catch(console.error);
    
  }
  
  if(oldMember.voiceChannelID) {
    const voicelama = oldMember.guild.channels.get(oldMember.voiceChannelID);
    
    if(voicelama.name.startsWith(`${oldMember.user.username}`)) {
      voicelama.delete()
      .then(function() {
        console.log('Voice Sebelumnya telah di hapus , dan berhasil Membuat Voice Baru')
      })
      .catch(console.error);
    }
    
  }
  
   if(newMember.voiceChannelID === voice2) {
    
    newMember.guild.createChannel(`${newMember.user.username}`, 'voice')
    .then(tempChannel => {
    tempChannel.setParent(kategori);
    newMember.setVoiceChannel(tempChannel.id);
    tempChannel.setUserLimit('5');
    })
    
    .catch(console.error);
    
  }
  
  if(oldMember.voiceChannelID) {
    const voicelama = oldMember.guild.channels.get(oldMember.voiceChannelID);
    
    if(voicelama.name.startsWith(`${oldMember.user.username}`)) {
      voicelama.delete()
      .then(function() {
        console.log('Voice Sebelumnya telah di hapus , dan berhasil Membuat Voice Baru')
      })
      .catch(console.error);
    }
    
  }
  
  if(newMember.voiceChannelID === voice3) {
    
    newMember.guild.createChannel(`${newMember.user.username}`, 'voice')
    .then(tempChannel => {
    tempChannel.setParent(kategori);
    newMember.setVoiceChannel(tempChannel.id);
    tempChannel.setUserLimit('10');
    })
    
    .catch(console.error);
    
  }
  
  if(oldMember.voiceChannelID) {
    const voicelama = oldMember.guild.channels.get(oldMember.voiceChannelID);
    
    if(voicelama.name.startsWith(`${oldMember.user.username}`)) {
      voicelama.delete()
      .then(function() {
        console.log('Voice Sebelumnya telah di hapus , dan berhasil Membuat Voice Baru')
      })
      .catch(console.error);
    }
    
  }
  
  }) 