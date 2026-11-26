import { Routes } from '@angular/router';
import { HeroPage } from './pages/hero/hero.page';

export const routes: Routes = [
  {
    path: '',
    // What: the hero ships in the main bundle (eager). Why: it's the landing page and only ~5 kB; lazy-loading it cost a whole
    // extra request round-trip before first paint (measured in Lighthouse). Three.js stays lazy (CityBackdrop's dynamic import).
    component: HeroPage,
    title: 'GitHub Wanted', // What: the browser tab title. Why: Angular's TitleStrategy sets it on navigation; screen readers announce it.
  },
  {
    path: 'u/:username', // What: deep-linkable profile URL. Why: brief requires /u/:username to be shareable and reloadable.
    loadComponent: () => import('./pages/profile/profile.page').then((m) => m.ProfilePage),
    // What: a function title, built from the URL. Why: each profile tab reads "@torvalds · GitHub Wanted", not a generic name.
    title: (route) => `@${route.paramMap.get('username')} · GitHub Wanted`,
  },
  {
    path: '**', // What: any unknown URL. Why: never show a blank screen (spec 14).
    redirectTo: '',
  },
];

// In plain English: "Home is the hero, /u/<name> is a profile, everything else goes home."
