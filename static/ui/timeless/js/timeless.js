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

let abortController
const { createApp, ref } = Vue
const app = createApp({
  data() {
    return {
      api: {
        available: false,
        capabilities: {
          vision: false
        }
      },
      time: '',
      poem: 'Patience, like dew upon dawn\'s whisper, awaits the unveiling of time\'s lyrical embrace.',
      // Adapt the template for the model you use, this is specific to 'Phi-3-Mini-4k'
      template: '<|user|>\nHello<|end|>\n<|assistant|>\nHow can I help?<|end|>\n<|user|>\nA very short poem incorporating the current time \'${this.time}\'<|end|>\n<|assistant|>',
      llmUserConfig: {
        n_predict: 200,
        temperature: 0.3,
        mirostat: 2,
        mirostat_lr: 0.1,
        mirostat_ent: 5.0,
        stop: ["</s>", "<|end|>", "<|user|>", "<|im_end|>", "user:", "User:", "---"]
      },
      fetching: false,
      streaming: false,
    }
  },
  created() {
    let healthCheckInProgress = false
    const healthCheckInterval = setInterval(async () => {
      if (healthCheckInProgress) return // otherwise this can pile up with auth
      healthCheckInProgress = true
      await this.checkHealth()
      if (this.api.capabilities.text) {
        this.api.available = true
        clearInterval(healthCheckInterval)
      }
    }, 1000)

    setInterval(() => {
      this.setTime()
    }, 1000)
  },
  computed: {
    instruction() {
      return eval('`' + this.template + '`')
    },
  },
  watch: {
    time(newValue, oldValue) {
      if (newValue != oldValue) this.query()
    }
  },
  methods: {
    setTime() {
      this.time = this.timeToWords(new Date())
    },
    timeToWords(time) {
      // Surely JS devs can do a better job than me!
      let h = time.getHours();
      let m = time.getMinutes();
      const nums = [ "midnight", "one", "two", "three", "four",
    						"five", "six", "seven", "eight", "nine",
    						"ten", "eleven", "twelve", "thirteen",
    						"fourteen", "fifteen", "sixteen", "seventeen",
    						"eighteen", "nineteen", "twenty", "twenty one",
    						"twenty two", "twenty three", "twenty four",
    						"twenty five", "twenty six", "twenty seven",
    						"twenty eight", "twenty nine"
    					];

      afternoon = false
      if (h > 12) {
        h = h - 12
        afternoon = true
      }
      if (h == 0 && m == 0) return nums[h]
    	if (m == 0) return nums[h] + " o' clock "
    	else if (m == 1) return "one minute past " + nums[h]
    	else if (m == 59) {
        if (afternoon && h == 11) h = -1
    		return "one minute to " + nums[(h % 12) + 1]
      }
    	else if (m == 15) return "quarter past " + nums[h]
    	else if (m == 30) return "half past " + nums[h]
    	else if (m == 45) {
        if (afternoon && h == 11) h = -1
    		return "quarter to " + nums[(h % 12) + 1]
      }
    	else if (m <= 30) return nums[m] + " minutes past " + nums[h]
    	else if (m > 30) {
        if (afternoon && h == 11) h = -1
    		return nums[60 - m] + " minutes to " + nums[(h % 12) + 1]
      }
    },
    async query() {
      if (!this.api.available || this.streaming) return
      this.streaming = true
      this.fetching = true
      await this.complete(this.llmUserConfig, this.instruction)
      this.streaming = false
    },
    async checkHealth() {
      try {
        const response = await fetch('/api')
        const data = await response.json()
        if (data) this.api = data
      } catch (e) {
        console.error('Failed to check API status')
        console.error(e)
      }
    },
    safeRender(text) {
      return DOMPurify.sanitize(text, { USE_PROFILES: { html: true } })
    },
    isShareable() {
      if (!this.fetching && !this.streaming && this.poem.length > 0) {
        return navigator.canShare
      }
      return false
    },
    share() {
      const data = {
        titie: 'Timeless by Inferenceable',
        text: this.poem
      }
      navigator.share(data)
    },
    abortRequest() {
      try {
        if (abortController) abortController.abort()
      } catch (e) {
        console.error(e)
      } finally {
        this.fetching = false
        this.poem = ''
      }
    },
    async complete(params = {}, prompt) {
      const completionParams = { ...params, prompt };
      const decoder = new TextDecoder();
      abortController = new AbortController();
      const abortSignal = abortController.signal;
      let chunks = '';

      try {
        const apiEndPoint = this.api.endpoints.infer
        const response = await fetch(apiEndPoint, {
          method: 'POST',
          headers: {
            'Connection': 'keep-alive',
            'Content-Type': 'application/json',
            'Accept': 'text/plain'
          },
          body: JSON.stringify(completionParams),
          signal: abortSignal
        });

        if (!response.ok) { throw new Error('Response error'); }

        this.fetching = false
        this.poem = ''
        const stream = response.body;
        const reader = stream.getReader();
        const readStream = async () => {
          try {
            const { done, value } = await reader.read();
            if (done) { return; }
            this.poem += decoder.decode(value);
            await readStream(); // Continue reading the stream
          } catch (e) {
            if (e.message && e.message.includes('aborted')) {
              this.poem += '...';
            } else {
              console.error('Error reading stream:', e);
              this.abortRequest()
            }
          }
        };
        await readStream(); // Start reading the stream
      } catch (e) {
        if (e.message && e.message.includes('aborted')) {
          this.poem += '...';
        }
        console.error(e);
        this.abortRequest()
        this.fetching = false;
      }
    },
  }
})

app.mount('#app')
