---
title: 'Neural audio codecs, simply explained'
description: 'How a neural network compresses audio into a few tokens per second, and why audio language models are built on them.'
date: 2026-11-24
---

I'm currently working on a neural audio codec as an intern at Logitech. I
can't write about that work, but the general ideas are public and worth
explaining. They are also the reason language models can now talk.

## What a codec does

A codec compresses audio into a small number of bits and turns those bits
back into audio. MP3 and Opus, the codec in most voice calls, are designed by
hand. They rely on what we know about human hearing: drop what the ear can't
hear, and spend the bits on what it can.

A neural codec learns the compression instead. It has three parts:

1. An **encoder**, a stack of convolutions that turns the waveform into a
   short sequence of vectors. At 24 kHz, a second of audio has 24,000 samples;
   the encoder might turn it into 75 vectors, one every 13 ms. Each vector is
   called a frame.
2. A **quantizer**, which replaces each vector with the nearest entry in a
   fixed list of vectors, called a codebook. Only the entry's index is stored.
   This is where the compression happens.
3. A **decoder**, which turns the indices back into a waveform.

The three parts are trained together, so the encoder learns what is worth
keeping.

## Residual vector quantization

One codebook is not enough. With 1,024 entries, each frame gets only 10 bits,
and the nearest entry is often far from the real vector.

The standard fix is **residual vector quantization** (RVQ). The first codebook
quantizes the vector. The second codebook quantizes the error the first one
left behind. The third quantizes what is still left, and so on. Each codebook
adds detail on top of the previous ones, like adding decimal places to a
number. With $K$ codebooks, the encoder's vector $z$ is stored as

$$
\hat{z} = q_1 + q_2 + \dots + q_K,
$$

where each $q_k$ is the entry of codebook $k$ nearest to what is still left,
$z - (q_1 + \dots + q_{k-1})$.

This also makes the bitrate easy to count and to change:

$$
\text{bitrate} = \text{frames per second} \times \text{codebooks} \times \text{bits per codebook}
$$

For EnCodec, that is $75 \times 8 \times 10 = 6{,}000$ bits/s, or 6 kbps.

Using fewer codebooks gives a lower bitrate and lower quality from the same
model. Codecs like SoundStream and EnCodec train with a random number of
codebooks, so one model works at several bitrates.

## How it is trained

If you train only to reproduce the waveform exactly, the output sounds muffled.
Many waveforms sound the same to us, and a model that has to pick one tends to
average them, which blurs the high frequencies.

So codecs use several losses together:

- a **reconstruction loss** on spectrograms, which compares what the ear
  cares about rather than exact sample values;
- an **adversarial loss**: discriminator networks try to tell real audio from
  decoded audio, which pushes the decoder toward sharp, natural sound;
- a **commitment loss**, which keeps the encoder's vectors close to the
  codebook entries.

The adversarial part is what makes low-bitrate neural codecs sound much
better than they "should".

## Why language models need them

The quantizer's indices are discrete tokens, just like text tokens. A language
model can be trained to predict them, and the codec's decoder turns its
predictions back into sound. This is how most audio language models work:
AudioLM and MusicGen generate audio tokens, VALL-E does speech synthesis with
EnCodec tokens, and Moshi holds spoken conversations using tokens from Mimi,
a codec Kyutai built for it.

For a sequence model, the most important number is how many tokens a second
of audio becomes. Here is ten seconds of audio:

| | Frames per second | Codebooks | Tokens for 10 s |
| --- | --- | --- | --- |
| Raw samples at 24 kHz | 24,000 | – | 240,000 |
| EnCodec at 6 kbps | 75 | 8 | 6,000 |
| Mimi at 1.1 kbps | 12.5 | 8 | 1,000 |

Raw audio is far too long for attention, whose cost grows with the square of
the sequence length. A codec brings it close to the length of text. Mimi's low
frame rate is a big part of why Moshi can run in real time.

## Not all tokens are equal

A codec trained only to reconstruct audio encodes everything: the words, the
voice, the room, the microphone noise. For a language model, the words matter
most, and they are spread across all the codebooks.

Newer codecs fix this by making the first codebook carry meaning. Mimi, for
example, trains its first codebook to match features from a self-supervised
speech model, so it captures mostly what is said. The remaining codebooks fill
in how it sounds. A language model can then focus on the first codebook and
treat the others as detail.

## What I find interesting

A codec is a sequence model problem from both sides. Its job is to find the
shortest token sequence that still lets you rebuild the sound, and the
models that use it need that sequence to be short and easy to predict. How few
tokens a second of speech really needs, and what each one should carry, are
still open questions. That's a big part of why I like working on them.
