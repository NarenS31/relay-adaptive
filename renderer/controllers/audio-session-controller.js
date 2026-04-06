export class AudioSessionController {
    constructor(options = {}) {
        this.electronAPI = options.electronAPI || null;
        this.mediaDevices = options.mediaDevices || navigator.mediaDevices;
        this.AudioContextCtor = options.AudioContextCtor || window.AudioContext;
        this.WorkerCtor = options.WorkerCtor || window.Worker;
        this.SoundDetectorClass = options.SoundDetectorClass;
        this.captionRenderer = options.captionRenderer || null;
        this.alertSystem = options.alertSystem || null;
        this.musicVisualizer = options.musicVisualizer || null;
        this.directionalAudio = options.directionalAudio || null;
        this.alertOverlay = options.alertOverlay || null;
        this.appStore = options.appStore || null;
        this.appBus = options.appBus || null;
        this.hearingAssistant = options.hearingAssistant || null;
        this.onRouteCommandInput = typeof options.onRouteCommandInput === 'function' ? options.onRouteCommandInput : () => {};
        this.onSetStatusText = typeof options.onSetStatusText === 'function' ? options.onSetStatusText : () => {};
        this.onSetDotActive = typeof options.onSetDotActive === 'function' ? options.onSetDotActive : () => {};
        this.onSetDotListening = typeof options.onSetDotListening === 'function' ? options.onSetDotListening : () => {};
        this.onVisualizerFrame = typeof options.onVisualizerFrame === 'function' ? options.onVisualizerFrame : () => {};
        this.onSoundDetected = typeof options.onSoundDetected === 'function' ? options.onSoundDetected : () => {};
        this.onFallbackReady = typeof options.onFallbackReady === 'function' ? options.onFallbackReady : () => {};
        this.getAlertCategories = typeof options.getAlertCategories === 'function' ? options.getAlertCategories : () => ({});

        this.useWhisperFallback = false;
        this.whisperWorker = null;
        this.audioContext = null;
        this.mediaStream = null;
        this.scriptProcessor = null;
        this.isRecording = false;
        this.isDeepgramStreaming = false;
        this.soundDetector = null;
    }

    setupDeepgramListeners() {
        this.electronAPI?.onDeepgramTranscript?.((result) => {
            if (!result?.transcript?.trim()) return;

            const currentTranscript = this.appStore?.getState?.()?.transcript || {};
            this.appStore?.setState?.({
                transcript: {
                    interim: result.isFinal ? null : result,
                    latestFinal: result.isFinal ? result : currentTranscript.latestFinal
                }
            });
            this.appBus?.emit?.(result.isFinal ? 'transcript.final' : 'transcript.interim', result);

            this.hearingAssistant?.handleTranscript?.(result);

            if (result.isFinal) {
                this.onRouteCommandInput(result.transcript, 'deepgram');
                this.onSetStatusText('Listening (Deepgram Nova-3)');
            } else {
                this.onSetStatusText('Transcribing...');
            }
        });

        this.electronAPI?.onDeepgramStatus?.((status) => {
            this.isDeepgramStreaming = Boolean(status?.connected);
            this.appStore?.setState?.({
                status: status?.connected ? 'connected' : (status?.error ? 'error' : 'disconnected'),
                audio: {
                    isStreaming: Boolean(status?.connected)
                }
            });

            this.onSetStatusText(status?.connected ? 'Connected (Deepgram Nova-3)' : (status?.error ? `Error: ${status.error}` : 'Disconnected'));
            this.onSetDotActive(Boolean(status?.connected));
            this.appBus?.emit?.('transcription.status', status);
        });

        this.electronAPI?.onDeepgramUtteranceEnd?.(() => {
            this.electronAPI?.log?.('Utterance ended');
            this.appBus?.emit?.('transcript.utterance_end', { timestamp: Date.now() });
        });
    }

    initWhisper() {
        if (this.whisperWorker) return;
        this.onSetStatusText('Initializing Offline Engine...');
        this.whisperWorker = new this.WorkerCtor('whisper-worker.js', { type: 'module' });
        this.whisperWorker.onmessage = (e) => {
            const { status, text } = e.data || {};
            if (status === 'ready') this.onSetStatusText('Offline Engine Ready');
            if (status === 'result' && text?.trim()) {
                this.captionRenderer?.addFinalSegment?.({ transcript: text, words: [], confidence: 0.5 });
            }
        };
        this.whisperWorker.postMessage({ type: 'load' });
    }

    async stop() {
        try {
            this.scriptProcessor?.disconnect?.();
        } catch (error) {}
        this.scriptProcessor = null;

        try {
            this.mediaStream?.getTracks?.().forEach((track) => track.stop());
        } catch (error) {}
        this.mediaStream = null;

        try {
            if (this.audioContext && this.audioContext.state !== 'closed') {
                await this.audioContext.close();
            }
        } catch (error) {}
        this.audioContext = null;

        try {
            await this.electronAPI?.deepgramStop?.();
        } catch (error) {}

        this.isRecording = false;
        this.appStore?.setState?.({
            audio: {
                isRecording: false
            }
        });
    }

    async startRecording(sourceId = 'mic') {
        await this.stop();
        this.appStore?.setState?.({
            audio: {
                isRecording: false,
                sourceId
            }
        });
        this.captionRenderer?.clear?.();

        try {
            this.mediaStream = await this.#resolveMediaStream(sourceId);
            this.audioContext = new this.AudioContextCtor({ sampleRate: 16000 });
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);

            this.soundDetector = new this.SoundDetectorClass(this.audioContext);
            this.soundDetector.onDetect((event) => this.#handleSoundEvent(event));
            this.soundDetector.connect(source, sourceId !== 'mic');

            this.directionalAudio?.connect?.(this.audioContext, source);

            const visAnalyser = this.audioContext.createAnalyser();
            visAnalyser.fftSize = 256;
            source.connect(visAnalyser);
            this.musicVisualizer?.connectAnalyser?.(visAnalyser);

            const startResult = await this.electronAPI?.deepgramStart?.();
            if (!startResult?.success) {
                throw new Error(startResult?.error || 'Failed to connect to Deepgram');
            }

            this.onSetStatusText('Connecting to Deepgram...');
            this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
            source.connect(this.scriptProcessor);
            this.scriptProcessor.connect(this.audioContext.destination);
            this.scriptProcessor.onaudioprocess = (event) => {
                const inputData = event.inputBuffer.getChannelData(0);
                const int16Data = this.#float32ToInt16(inputData);
                if (this.isDeepgramStreaming) {
                    this.electronAPI?.deepgramSendAudio?.(Array.from(int16Data));
                }
                this.onVisualizerFrame(inputData);
            };

            this.isRecording = true;
            this.appStore?.setState?.({
                status: 'listening',
                audio: {
                    isRecording: true,
                    sourceId
                }
            });
            this.onSetDotListening(true);
            this.onSetDotActive(true);
        } catch (err) {
            this.electronAPI?.log?.(`Recording error: ${err}`);
            this.onSetStatusText(`Error: ${err.message}`);
            this.appStore?.setState?.({
                status: 'error',
                audio: {
                    isRecording: false,
                    sourceId
                }
            });
            this.useWhisperFallback = true;
            this.initWhisper();
            this.onFallbackReady(err);
        }
    }

    async #resolveMediaStream(sourceId) {
        if (sourceId === 'mic') {
            this.onSetStatusText('Listening (Microphone)');
            return this.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });
        }

        if (sourceId === 'system-audio') {
            const sources = await this.electronAPI?.getSources?.();
            const screenSource = sources?.find?.((source) => source.id.startsWith('screen:'));
            if (!screenSource) {
                this.onSetStatusText('Screen Recording permission required');
                throw new Error('Screen Recording permission required');
            }
            sourceId = screenSource.id;
        }

        const stream = await this.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId
                }
            },
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId,
                    maxWidth: 1,
                    maxHeight: 1
                }
            }
        });
        stream.getVideoTracks().forEach((track) => track.stop());
        this.onSetStatusText('Listening (System Audio)');
        return stream;
    }

    #handleSoundEvent(event) {
        if (event.category === 'media' && event.isMusic) {
            this.musicVisualizer?.show?.({ genre: event.className });
        } else if (event.category !== 'media') {
            this.musicVisualizer?.hide?.();
        }

        if (event.category !== 'media' || this.getAlertCategories()?.media) {
            this.alertSystem?.show?.({
                category: event.category,
                label: event.label,
                detail: null,
                className: event.className
            });
        }

        this.onSoundDetected(event);

        if (this.alertOverlay) {
            const type = event.category === 'emergency' ? 'danger' : 'warning';
            this.alertOverlay.className = `${type} active`;
            setTimeout(() => {
                this.alertOverlay.className = '';
            }, 2000);
        }

        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200]);
        }
    }

    #float32ToInt16(float32Array) {
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return int16Array;
    }
}

export default AudioSessionController;
