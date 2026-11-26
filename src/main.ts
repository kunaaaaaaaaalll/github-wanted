import { bootstrapApplication } from '@angular/platform-browser';
import { gsap } from 'gsap'; // What: the core engine. Why: needed to call registerPlugin below.
import { ScrollTrigger } from 'gsap/ScrollTrigger'; // What: scroll-driven animation plugin. Why: stat bars and mission cards animate on scroll.
import { SplitText } from 'gsap/SplitText'; // What: splits text into chars/words. Why: the hero title animates letter by letter.
import { appConfig } from './app/app.config';
import { App } from './app/app';

gsap.registerPlugin(ScrollTrigger, SplitText); // What: tells GSAP the plugins exist, ONCE, before anything renders. Why: without it, plugins can be tree-shaken away and scrollTrigger options are silently ignored.

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));

// In plain English: "Introduce GSAP to its two plugins once, then start the app."
