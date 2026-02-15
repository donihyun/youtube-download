import {exec} from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

const url = process.argv[2];

if (!url) {
    console.error('Usage: node download-yt.js <youtube_url>');
    process.exit(1);
}

async function download() { 
    try {
        console.log('Downloading video...');
        await execPromise(`yt-dlp -f "bestvideo[ext=mp4]" -o "./downloads/%(title)s_video.%(ext)s" "${url}"`);
        
        console.log('Downloading audio...');
        await execPromise(`yt-dlp -f "bestaudio[ext=m4a]" -o "./downloads/%(title)s_audio.%(ext)s" "${url}"`);
        
        console.log('✓ Done!');
    } catch (error) {
        console.error('Error during download:', error);
    }
}

download(); 