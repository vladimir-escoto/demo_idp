// @ts-nocheck — mirrors the structure of the console's generated registry,
// reduced to the subset of frameworks relevant for B2B tenant developers.
import { safeLazy } from 'react-safe-lazy';

import apiExpress from './api-express/index';
import m2mGeneral from './m2m-general/index';
import nativeAndroid from './native-android/index';
import nativeCapacitor from './native-capacitor/index';
import nativeExpo from './native-expo/index';
import nativeFlutter from './native-flutter/index';
import nativeIosSwift from './native-ios-swift/index';
import spaAngular from './spa-angular/index';
import spaReact from './spa-react/index';
import spaVanilla from './spa-vanilla/index';
import spaVue from './spa-vue/index';
import { type Guide } from './types';
import webExpress from './web-express/index';
import webNext from './web-next/index';
import webNextAppRouter from './web-next-app-router/index';

const entry = (order, id, metadata, hasDarkLogo, folder = id) => ({
  order,
  id,
  Logo: safeLazy(async () => import(`./${folder}/logo.svg?react`)),
  DarkLogo: hasDarkLogo ? safeLazy(async () => import(`./${folder}/logo-dark.svg?react`)) : undefined,
  Component: safeLazy(async () => import(`./${folder}/README.mdx`)),
  metadata,
});

export const guides: Readonly<Guide[]> = Object.freeze([
  entry(1, 'web-next-app-router', webNextAppRouter, true),
  entry(1.1, 'spa-react', spaReact, false),
  entry(1.2, 'spa-vue', spaVue, false),
  entry(1.3, 'm2m-general', m2mGeneral, true),
  entry(2, 'web-next', webNext, true),
  entry(3, 'web-express', webExpress, true),
  entry(4, 'spa-angular', spaAngular, false),
  entry(5, 'spa-vanilla', spaVanilla, false),
  entry(6, 'native-capacitor', nativeCapacitor, false),
  entry(7, 'native-ios-swift', nativeIosSwift, false),
  entry(8, 'native-android', nativeAndroid, false),
  entry(9, 'native-flutter', nativeFlutter, false),
  entry(10, 'native-expo', nativeExpo, true),
  entry(11, 'api-express', apiExpress, true),
]);
