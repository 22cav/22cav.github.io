---
title: 'A Kalman-like head for decoding hand movement from EEG'
summary: 'A small output layer for EEG decoders that keeps position and velocity consistent and reports its own uncertainty.'
result: 'Better zero-shot position R² for 11 of 12 subjects, 29–48% smoother trajectories, 0.75 ms extra cost.'
context: 'Semester project, Integrated Neurotechnologies Lab, EPFL'
date: 2026-09-01
order: 2
---

## The problem

The goal is to decode where a hand is, and where it is moving, in 3D, using
only EEG electrodes on the scalp. The signal is weak and noisy, so this is hard.

Most decoders are a neural network with a plain linear layer at the end. That
layer predicts position and velocity separately, as if they were unrelated. But
velocity is how position changes over time. A decoder that ignores this can
predict a position that jumps around while the velocity says the hand is still.

## What I did

I replaced the last layer with a Kalman-like regression head. It does two
things.

1. **It links position and velocity.** The head predicts a state that moves
   forward in time the way a physical object does, so position and velocity
   stay consistent with each other.
2. **It predicts uncertainty.** Instead of a single point, the head outputs its
   best estimate and how confident it is. When the signal is noisy, it trusts
   the new measurement less and relies more on where the hand was heading.

The head can be added to an existing decoder and adds very little computation.

## Results

The main test was zero-shot: the model is evaluated on subjects it never saw
during training. This is the setting that matters if a decoder is ever going to
be used on a new person.

- Position R² improved for 11 of 12 subjects.
- Trajectories became 29–48% smoother (lower roughness).
- The extra cost was 0.75 ms per prediction.

The vertical axis stayed the hardest to decode, as it is in most work on this
problem.
