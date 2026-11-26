// Site-wide facts that aren't a project or a post: who you are, where to find
// you, and the News list on the home page. Edit here; the pages read from this file.

export const person = {
  name: 'Matteo Caviglia',
  email: 'matteocaviglia03@gmail.com',
  github: 'https://github.com/22cav',
  linkedin: 'https://linkedin.com/in/matteocaviglia',
  huggingface: 'https://huggingface.co/matcav',
};

// Newest first. Shown on the home page. Keep each item to one line.
// `text` may contain a link: write it as [words](/path/).
export const news: { when: string; text: string }[] = [
  {
    when: 'Nov 2026',
    text: 'Confirmed as a Teaching Assistant for CS-552 Modern Natural Language Processing at EPFL in the Spring 2027 semester.',
  },
  {
    when: 'Oct 2026',
    text: 'Released [Rewind-Listen](/projects/rewind-listen/): an on-device LLM that reads your question while you are still speaking.',
  },
  {
    when: 'Sep 2026',
    text: 'Submitted my work on [decoding hand movement from EEG](/projects/eeg-kinematic-decoding/) to ICASSP 2027.',
  },
  {
    when: 'Aug 2026',
    text: 'Started as an ML engineering intern at Logitech, working on a neural audio codec.',
  },
  {
    when: 'Jun 2026',
    text: 'Finished two EPFL projects: [an attack on LLM routers](/projects/adversarial-router-paraphrasing/) and [a study of the Muon optimizer](/projects/muon-singular-values/).',
  },
  {
    when: 'Nov 2025',
    text: 'Won 2nd place in the Logitech track at LauzHack 2025 with [3DX](https://github.com/22cav/3DX).',
  },
  {
    when: 'Sep 2025',
    text: 'Started my MSc in Data Science at EPFL and joined the EPFL AI Team.',
  },
];
