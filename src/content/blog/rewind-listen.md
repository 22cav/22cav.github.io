---
title: 'Letting an LLM listen while you talk'
description: 'How Rewind-Listen cuts the wait before a voice assistant answers, using a simple property of the KV cache.'
date: 2026-11-23
---

Most voice assistants built from a speech recognizer and an LLM work in two steps. They wait until you stop talking, transcribe everything, and only then give the text to the LLM. The LLM does nothing while you speak, and all of its reading happens after you are done, while you wait.

[Rewind-Listen](/projects/rewind-listen/) makes the LLM read the question
while you are still asking it. On a MacBook Air, the first word of the answer
comes 128 ms after the system decides you are done, instead of 513 ms. This post explains the
idea, starting from the piece it is built on: the KV cache.

## What the KV cache is

An LLM reads text as a sequence of tokens. In every layer, attention turns each token into a key and a value, and each new token looks at the keys and values of all the tokens before it.

In a decoder LLM, attention is causal: a token can only look backwards. So the keys and values of a token depend only on that token and the ones before it. Adding text at the end never changes them.

That is why LLMs keep a **KV cache**. Once a token has been read, its keys and values are stored, and the model never computes them again. To read more text, it only needs a forward pass on the new tokens.

## Speech Recognizers are not so certain

This gives a natural way to listen while you talk. Every time you pause, the
recognizer transcribes what you said so far, and the new words are added to
the cache. When you stop, almost everything has already been read.

There is one problem. Speech recognizers change their mind. The last few words
of a transcript are often wrong until the recognizer hears what comes next:

```
after 1.2 s:  what's the whether
after 2.0 s:  what's the weather in Paris
```

The cache now holds keys and values for "whether", which is no longer in the
transcript. Everything after it was computed from the wrong word.

## Rewinding the cache

The fix uses the same property as before. The keys and values of a token
depend only on the tokens before it. So the cache for any prefix of the text
is exactly what you would get by reading that prefix alone.

When a new transcript arrives, Rewind-Listen compares it with the old one,
token by token, and finds the longest prefix they share:

```
old:  what's the | whether
new:  what's the | weather in Paris
                 ^ shared prefix ends here
```

It then **rewinds** the cache: it drops the entries after the shared prefix and
keeps the rest. Dropping entries is free. Only the new part ("weather in
Paris") gets a forward pass.

The result is exactly the same as reading the final transcript from scratch,
not an approximation. Because of causality, the entries it kept are the ones a
fresh read would compute. In practice the recognizer only revises the last few
words, so each update costs a few tokens.

## Knowing when you are done

Reading early only helps if the system also knows when to answer. The usual
way is to wait for a fixed amount of silence. If it is too short, the
assistant cuts you off mid-sentence. If it is too long, every answer is late.

The LLM can help here too. It has already read your words, so it can estimate
how likely it is that the sentence ends at this point. Rewind-Listen uses that
estimate to set the silence it waits for:

- "What's the weather in Paris" looks finished, so about 0.3 s of silence is
  enough.
- "What's the weather in" looks unfinished, so it waits about 1.2 s.

This shortened the wait by 38% compared with a fixed timeout, without cutting
people off more often.

## What it costs

Nothing is trained. Rewind-Listen uses an off-the-shelf Parakeet recognizer and
any chat model that runs with mlx-lm. On an 8 GB MacBook Air M2 with
Qwen3-1.7B:

| | Two-step pipeline | Rewind-Listen |
| --- | --- | --- |
| First answer token after the turn ends | 513 ms | 128 ms |
| VoiceBench accuracy (1,064 questions) | 39.2% | 39.9% |

Accuracy is not significantly different, which is what you would expect: the
model sees the same text either way, it just reads it earlier.

The code is on [GitHub](https://github.com/22cav/rewind-listen).
