---
title: 'Reading up on state space models: from S4 to Mamba-2'
description: 'How a control-theory system, an RNN, a convolution, an LSTM gate and attention turn out to be one model. My notes on S4, Mamba and Mamba-2.'
date: 2026-11-25
draft: true
---

State space models (SSMs) are the part of sequence modeling I find most
interesting, and the reason is not a benchmark. It is that ideas which grew up
apart keep turning out to be the same thing. Continuous-time systems from
control theory, recurrent networks, convolutions, the gates of an LSTM and
attention were invented by different communities, for different problems,
years or decades apart. Read in order, the SSM papers show them as one model
seen from different sides.

I recently went back and read the main papers: S4, Mamba and Mamba-2. These are
my notes. I follow one thread through them: each paper adds one idea, and each
idea connects SSMs to another family of models.

## The starting point: a linear system

An SSM starts from a continuous linear system from control theory. An input
signal $x(t)$ drives a hidden state $h(t) \in \mathbb{R}^N$, and the output
$y(t)$ is read from the state:

$$
\begin{aligned}
h'(t) &= A\,h(t) + B\,x(t) \\
y(t) &= C\,h(t)
\end{aligned}
$$

To use it on tokens, you **discretize** it with a step size $\Delta$. This
gives a plain linear recurrence:

$$
\begin{aligned}
h_t &= \bar{A}\,h_{t-1} + \bar{B}\,x_t \\
y_t &= C\,h_t
\end{aligned}
$$

where $\bar{A}$ and $\bar{B}$ are computed from $A$, $B$ and $\Delta$. With the
zero-order hold rule that Mamba uses, for example:

$$
\bar{A} = e^{\Delta A}, \qquad \bar{B} = (\Delta A)^{-1}\left(e^{\Delta A} - I\right) \Delta B
$$

This is already two models in one. The first pair of equations is a system
from control theory; the second is a linear RNN. The papers below differ in
how $A$, $B$, $C$ and $\Delta$ are chosen, and in how the recurrence is
computed fast.

The recurrence has one big advantage over attention. Generating a token costs
the same at step 10 as at step 100,000, because the model only keeps $h_t$,
not the whole history. The hard part is making something this simple
remember enough, and training it fast.

## S4: the same model is an RNN and a CNN

*Gu, Goel and Ré, "Efficiently Modeling Long Sequences with Structured State
Spaces", ICLR 2022.*

Two ideas carry S4.

**A good $A$.** A random $A$ forgets quickly. S4 starts from HiPPO, an earlier
result by the same group: a specific matrix $A$ for which the state is an
online summary of the whole past input, its projection onto Legendre
polynomials. With that initialization, the state keeps information over very
long ranges.

**A convolution for training.** In S4, $A$, $B$, $C$ and $\Delta$ are the same
at every step: the system is linear and time-invariant. Unrolling the
recurrence from $h_{-1} = 0$ gives

$$
y_t = \sum_{k=0}^{t} C \bar{A}^{k} \bar{B}\, x_{t-k},
$$

so the output is a convolution of the input with a fixed kernel:

$$
\bar{K} = \left(C\bar{B},\; C\bar{A}\bar{B},\; C\bar{A}^2\bar{B},\; \dots\right), \qquad y = \bar{K} * x
$$

So the same model is an RNN when it generates, one step at a time, and a CNN
when it trains: compute $\bar{K}$ once and apply it to the whole sequence with
an FFT, in parallel. The paper just before S4 from the same group says it in
its title: *Combining Recurrent, Convolutional, and Continuous-time Models with
Linear State-Space Layers*. Three families, one set of equations.

Computing $\bar{K}$ naively needs powers of $\bar{A}$, which is expensive. S4
writes $A$ as a normal matrix plus a low-rank term, which makes the kernel
cheap to compute. That part of the paper is the most technical. Later work
(DSS, then S4D) showed that a **diagonal** $A$ works almost as well, which
made the whole thing much simpler.

S4 was the first model to solve Path-X in the Long Range Arena benchmark, a
task on sequences of 16,000 steps where earlier models did no better than
chance. But on language it lagged behind transformers.

## Mamba: the LSTM's gate falls out of the equations

*Gu and Dao, "Mamba: Linear-Time Sequence Modeling with Selective State
Spaces", 2023.*

Mamba's diagnosis is that time-invariance is the problem. If $B$, $C$ and
$\Delta$ are fixed, the model treats every token the same way. It cannot
decide to remember one token and ignore the next. Language needs that all the
time.

So Mamba makes them depend on the input: $B_t$, $C_t$ and $\Delta_t$ are
computed from $x_t$. The paper calls this **selection**. The step size
$\Delta_t$ is the easiest to interpret. Since $A$ has negative entries,
$\bar{A}_t = e^{\Delta_t A}$ works like a gate:

- a large $\Delta_t$ makes $\bar{A}_t \approx 0$, so the state is mostly reset
  and the current token is written in;
- a small $\Delta_t$ makes $\bar{A}_t \approx I$, so the state is kept and the
  current token is mostly ignored.

This is the gate of an LSTM or a GRU. Those gates were designed by hand, to
stop gradients from vanishing. Here nobody adds one: it comes out of
discretizing a differential equation with an input-dependent step. The paper
makes this exact. With a one-dimensional state, the selective SSM reduces to
the classic gated RNN update

$$
h_t = (1 - g_t)\, h_{t-1} + g_t\, x_t,
$$

where the gate $g_t$ is a sigmoid of the input.

The price is that the model is no longer a convolution, so the FFT trick is
gone. Mamba computes the recurrence with a **parallel scan** instead, written
as a GPU kernel that keeps the expanded state in fast on-chip memory (SRAM)
and never writes it to main memory. In the backward pass it recomputes the
states instead of storing them. The paper is as much about this kernel as
about the model.

The results made people take SSMs seriously for language. Mamba matched
transformers of the same size, and transformers twice its size at 3B
parameters, with about 5× higher generation throughput.

## Mamba-2: an SSM is a kind of attention

*Dao and Gu, "Transformers are SSMs: Generalized Models and Efficient
Algorithms Through Structured State Space Duality", ICML 2024.*

This is the paper that closes the loop. Mamba-2 restricts $A$ further: in
each head, the transition is a scalar times the identity, $\bar{A}_t = a_t I$.
With that restriction, you can write the whole sequence map as one matrix:

$$
y = M x, \qquad
M_{ij} =
\begin{cases}
C_i^{\top} B_j \cdot a_i\, a_{i-1} \cdots a_{j+1} & j \le i \\
0 & j > i
\end{cases}
$$

Compare this with attention. $C_i^{\top} B_j$ plays the role of a query–key
score, and the product of the $a$'s is a causal mask that decays with
distance. So this SSM *is* a form of masked linear attention, and masked
linear attention with this decay *is* an SSM. The paper calls this **state
space duality** (SSD). The model that was supposed to replace attention turns
out to be a special case of it.

The duality also makes it faster. The recurrence form is cheap in total work,
$O(T)$ in the sequence length, but runs as a scan. The matrix form uses matrix
multiplications, which GPUs are built for, but costs $O(T^2)$. Mamba-2's
algorithm splits the sequence into chunks: inside a chunk it uses the matrix
form, and between chunks it passes the state along with the recurrence. That
uses tensor cores and was 2–8× faster than Mamba's scan, which also made much
larger states practical ($N$ = 64 to 256 instead of 16).

The cost is expressivity: a scalar $a_t$ per head is a weaker transition than
Mamba's diagonal $\bar{A}_t$. In practice it did not hurt, which is itself a
useful result.

## What I took away

The thing I like most about this line of work is that it is a story of
convergence. Here is the same set of equations, read five ways:

| View | Where the idea comes from | Where it shows up |
| --- | --- | --- |
| Continuous-time system | Control theory, signal processing | The definition: $h'(t) = A\,h(t) + B\,x(t)$ |
| Linear RNN | Discretizing the system | Generating one token at a time |
| Convolution | Unrolling a time-invariant system | S4's parallel training |
| Gated RNN (LSTM, GRU) | An input-dependent step $\Delta_t$ | Mamba's selection |
| Linear attention | Writing the whole map as one matrix | Mamba-2's duality |

None of these communities set out to build the same model. Control theorists
wanted to describe physical systems, RNN researchers wanted memory, the gates
were a fix for training, and attention was built to look up any past token
directly. They meet in one place.

And the convergence is not only elegant: every new view came with a practical
gain. The convolution view gave S4 fast training. The gate view explains why
Mamba's $\Delta$ works. The attention view gave Mamba-2 an algorithm built on
matrix multiplications, and with it a large speedup. Each time two models
turned out to be the same, the tricks of one could be used on the other.

The question I want to understand better next is where the fixed-size state is not enough anymore: which tasks need exact recall, what attention gives you there, and how much a few attention layers in a mostly-SSM model recover.
