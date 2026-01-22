/**
 * Audio Feedback Module
 * Provides TTS and Sound Effects for "Eyes-Free" usage.
 */

class AudioFeedbackService {
    constructor() {
        this.synth = window.speechSynthesis;
        this.enabled = true;
        
        // Simple generated beep for success
        // In a real premium app we might load an mp3, but Oscillator is instant and dependency-free
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    /**
     * Speak text using TTS
     * @param {string} text 
     */
    speak(text) {
        if (!this.enabled || !this.synth) return;
        
        // Cancel pending
        this.synth.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.1; // Slightly faster for efficiency
        utterance.pitch = 1.0;
        
        // Try to find a good voice
        const voices = this.synth.getVoices();
        const preferred = voices.find(v => v.lang === 'en-US' && v.name.includes('Google')) || voices[0];
        if (preferred) utterance.voice = preferred;

        this.synth.speak(utterance);
    }

    /**
     * Play a subtle "success" ding
     */
    playSuccess() {
        if (!this.enabled) return;
        this.playTone(800, 'sine', 0.1);
        setTimeout(() => this.playTone(1200, 'sine', 0.2), 100);
    }

    /**
     * Play a generic beep/tone
     */
    playTone(freq, type, duration) {
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
        
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
        
        gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        
        osc.start();
        osc.stop(this.audioCtx.currentTime + duration);
    }

    /**
     * Play an error buzz
     */
    playError() {
        if (!this.enabled) return;
        this.playTone(150, 'sawtooth', 0.3);
    }
}

window.AudioFeedback = new AudioFeedbackService();
