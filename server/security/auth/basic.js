/*
 * The Apache License, Version 2.0
 *
 * Copyright 2024 Inferenceable, HyperMink
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

 /*
  * A super simple HTTP Basic Authentication strategy.
  * For production, use OAuth or other passport.js strategies
  */

import express from 'express';
import passport from 'passport';
import { BasicStrategy } from 'passport-http';

const router = express.Router();

router.use(passport.initialize());

passport.use(new BasicStrategy(
  (username, password, done) => {
    if (username === process.env.USERNAME && password === process.env.PASSWORD) {
      return done(null, { username: username });
    } else {
      return done(null, false, { message: 'Incorrect username or password' });
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

router.root = (req, res, next) => {
  passport.authenticate('basic', { session: false })(req, res, next);
};

router.api = (req, res, next) => {
  passport.authenticate('basic', { session: false })(req, res, next);
};

export default router;
