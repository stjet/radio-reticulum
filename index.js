const { readdirSync, readFileSync } = require("fs");
const exec = require("util").promisify(require("child_process").exec);

const c2enc = require("./codec2/c2enc.js");
const sox = require("./codec2/sox.js");
const Codec2Lib = require("./codec2/codec2-lib.js");
const protobuf = require("protobufjs");
const decode_audio = require("audio-decode");
const { audioToSlice } = require("audio-slicer");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const MESHCHAT_API_SERVER = "localhost:8000";
const CODEC_MODE = "3200";

let AudioCallPayload;

//based on timestamp, get current audio to play (and time in audio if possible)
function get_current(start_timestamp, audio_infos, audio_order) {
  const total_duration = Object.values(audio_infos).reduce((accum, info) => accum + info.duration, 0);
  const diff = Math.round((Date.now() - start_timestamp) / 1000) % total_duration; //loop once over
  let total_so_far = 0;
  for (const audio of audio_order) {
    const duration = audio_infos[audio].duration;
    if (total_so_far + duration > diff) {
      return {
        audio,
        info: audio_infos[audio],
        start_at: diff - total_so_far,
      };
    }
    total_so_far += duration;
  }
}

const S = 1; //anymore and it seems to go over the 431 bytes, for 32000 bitrate

let current_second, first;
let listeners = [];

//in future, share the wav?
async function get_one_second(audio, second, call_hash) {
  if (!listeners.includes(call_hash)) listeners.push(call_hash);
  if (!first) first = call_hash;
  if (call_hash !== first) return current_second;
  //must have ffmpeg installed ofc
  await exec(`ffmpeg -y -ss ${second} -t ${S} -i ./audio/${audio} -filter:a loudnorm ./temp.wav`);
  current_second = readFileSync("./temp.wav").buffer;
  return current_second;
}

async function handle_call(call_hash, start_timestamp, audio_infos, audio_order) {
  let stop = false;
  const ws = new WebSocket(`ws://${MESHCHAT_API_SERVER}/api/v1/calls/${call_hash}/audio`);
  ws.addEventListener("open", async () => {
    async function play_current() {
      const current = get_current(start_timestamp, audio_infos, audio_order);
      console.log(current);
      //set a timeout so the next song will play
      //slice wav into one second slices (so they fit in the packet)
      for (let s = current.start_at; s < Math.ceil(current.info.duration); s++) {
        if (stop) return;
        const start = Date.now();
        try {
          const encoded = await Codec2Lib.runEncode(CODEC_MODE, await Codec2Lib.audioFileToRaw(await get_one_second(current.audio, s, call_hash), "audio.wav"));
          const audio_payload = AudioCallPayload.encode(AudioCallPayload.fromObject({
            audioData: {
              codec2Audio: {
                mode: `MODE_${CODEC_MODE}`,
                encoded,
              },
            },
          })).finish();
          //console.log("sent", (start + S * 1000) - Date.now());
          ws.send(audio_payload);
        } catch (e) {
          console.log(e);
        }
        await sleep((start + S * 1000) - Date.now());
      }
      //next song
      play_current();
    }
    play_current();
  });
  ws.addEventListener("close", async () => {
    stop = true;
    console.log("closing");
    ws.close();
    if (first === call_hash) first = undefined;
  });
}

//expects only .wav files
(async () => {
  const pb = await protobuf.load("./audio_call.proto");
  AudioCallPayload = pb.lookupType("AudioCallPayload");
  //const Codec2AudioMode = pb.lookupEnum("Codec2Audio.Mode");

  //randomise audio order
  let audio_random = {};
  for (const audio of readdirSync("./audio", { withFileTypes: true }).filter((file) => file.name.endsWith(".wav")).map((file) => file.name)) {
    audio_random[audio] = Math.random();
  }

  //should be const but when we debug we want to override a lot, so a let for convenience
  let audio_order = Object.keys(audio_random).toSorted((a, b) => audio_random[a] - audio_random[b]);

  //get audio info and whatnot
  let audio_infos = {};

  for (const audio of Object.keys(audio_random)) {
    const decoded_audio = await decode_audio(readFileSync(`./audio/${audio}`).buffer);
    audio_infos[audio] = {
      duration: decoded_audio.duration,
    };
  }

  //audio_order = ["old-time-religion.wav"];

  await fetch(`http://${MESHCHAT_API_SERVER}/api/v1/announce`);

  let calls_seen = [];

  async function take_calls() {
    const incoming_calls = (await (await fetch(`http://${MESHCHAT_API_SERVER}/api/v1/calls`)).json()).audio_calls.filter(
      (call) => call.is_active,
    );

    const start_timestamp = Date.now();

    for (const call of incoming_calls) {
      if (calls_seen.includes(call.hash)) continue;
      console.log("Taking incoming call", call.hash);
      calls_seen.push(call.hash);
      handle_call(call.hash, start_timestamp, audio_infos, audio_order);
      await sleep(1000);
    }
  }
  setInterval(take_calls, 7000);
})();

setInterval(() => {
  listeners = [];
}, 25000);

setInterval(() => {
  console.log(Date.now());
  if (listeners) console.log(`Active listeners: ${listeners.length}`);
}, 61000);

