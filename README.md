Disclaimer: Probably fairly buggy. But it works tm.

A bunch of spaghetti and code from [meshchat](https://github.com/liamcottle/reticulum-meshchat) (made by Liam Cottle, licensed under MIT) stapled together to create a radio. Call the radio on Meshchat, and some music will play. Codec2 is very low quality (max quality is 3200 bits/sec, and it is optimised for human voices), but that just makes it more fun.

How do you run it? Clone the repo, install the dependencies (`npm install`), create an `audio` directory, drop whatever .wav files you want in it, then run it with `node index.js`.

Anecdotally, rap and bluegrass play best as they usually only have one or two instruments at a time, and the vocals are very central.

Requires ffmpeg to be installed, and a Meshchat server to be running.

The codec2 folder is not written by me, but taken from Meshchat. I'm pretty sure Liam did not write whatever the source of the WASM and the bindings are, though, was probably someone else.

