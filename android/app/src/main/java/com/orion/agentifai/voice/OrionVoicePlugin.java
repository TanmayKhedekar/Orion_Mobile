package com.orion.agentifai.voice;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.Locale;

@CapacitorPlugin(
    name = "OrionVoice",
    permissions = {
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone")
    }
)
public class OrionVoicePlugin extends Plugin {

    private SpeechRecognizer speechRecognizer;
    private TextToSpeech textToSpeech;
    private boolean isTtsInitialized = false;
    private String currentTranscript = "";
    private boolean isListening = false;
    private PluginCall activeStartCall;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        boolean available = SpeechRecognizer.isRecognitionAvailable(getContext());
        boolean onDeviceAvailable = false;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                onDeviceAvailable = SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
            } catch (Exception ignored) {}
        }

        // Detect Snapdragon hardware info safely
        String hardware = Build.HARDWARE != null ? Build.HARDWARE.toLowerCase() : "";
        String board = Build.BOARD != null ? Build.BOARD.toLowerCase() : "";
        boolean isSnapdragon = hardware.contains("qcom") || board.contains("qcom") || hardware.contains("snapdragon");

        JSObject ret = new JSObject();
        ret.put("available", true);
        ret.put("speechAvailable", available);
        ret.put("provider", onDeviceAvailable ? "Android On-Device Speech Recognizer (Snapdragon)" : "Android Speech Recognizer");
        ret.put("model", onDeviceAvailable ? "Whisper-compatible On-Device ASR" : "System ASR Engine");
        ret.put("onDevice", onDeviceAvailable);
        ret.put("npuAccelerated", isSnapdragon && onDeviceAvailable);
        ret.put("ttsAvailable", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (!getPermissionState("microphone").equals(com.getcapacitor.PermissionState.GRANTED)) {
            activeStartCall = call;
            requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
            return;
        }

        startRecognition(call);
    }

    @PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        if (getPermissionState("microphone").equals(com.getcapacitor.PermissionState.GRANTED)) {
            startRecognition(call);
        } else {
            call.reject("Microphone permission was denied.");
            JSObject err = new JSObject();
            err.put("error", "Microphone permission denied");
            notifyListeners("voiceError", err);
        }
    }

    private void startRecognition(PluginCall call) {
        final String language = call.getString("language", "en-US");

        getActivity().runOnUiThread(() -> {
            try {
                destroyRecognizer();

                // Safely attempt on-device recognizer first, falling back to standard speech recognizer
                boolean created = false;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    try {
                        if (SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext())) {
                            speechRecognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
                            created = true;
                        }
                    } catch (Exception ignored) {}
                }

                if (!created || speechRecognizer == null) {
                    speechRecognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                }

                currentTranscript = "";

                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
                intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.putExtra(RecognizerIntent.EXTRA_MASK_OFFENSIVE_WORDS, false);
                }

                speechRecognizer.setRecognitionListener(new RecognitionListener() {
                    @Override
                    public void onReadyForSpeech(Bundle params) {
                        isListening = true;
                        notifyListeners("voiceStarted", new JSObject());
                    }

                    @Override
                    public void onBeginningOfSpeech() {}

                    @Override
                    public void onRmsChanged(float rmsdB) {}

                    @Override
                    public void onBufferReceived(byte[] buffer) {}

                    @Override
                    public void onEndOfSpeech() {}

                    @Override
                    public void onError(int error) {
                        isListening = false;
                        String errorMsg = getErrorText(error);
                        JSObject err = new JSObject();
                        err.put("error", errorMsg);
                        err.put("errorCode", error);
                        // If we already have partial transcript, emit it as fallback result before error
                        if (currentTranscript != null && !currentTranscript.trim().isEmpty()) {
                            JSObject ret = new JSObject();
                            ret.put("text", currentTranscript.trim());
                            notifyListeners("voiceCompleted", ret);
                        }
                        notifyListeners("voiceError", err);
                    }

                    @Override
                    public void onResults(Bundle results) {
                        isListening = false;
                        ArrayList<String> matches = results != null ? results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) : null;
                        String text = (matches != null && !matches.isEmpty()) ? matches.get(0) : currentTranscript;
                        currentTranscript = text != null ? text.trim() : "";

                        JSObject ret = new JSObject();
                        ret.put("text", currentTranscript);
                        notifyListeners("voiceCompleted", ret);
                    }

                    @Override
                    public void onPartialResults(Bundle partialResults) {
                        ArrayList<String> matches = partialResults != null ? partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) : null;
                        if (matches != null && !matches.isEmpty()) {
                            String partial = matches.get(0);
                            currentTranscript = partial;

                            JSObject ret = new JSObject();
                            ret.put("text", partial);
                            notifyListeners("voicePartial", ret);
                        }
                    }

                    @Override
                    public void onEvent(int eventType, Bundle params) {}
                });

                speechRecognizer.startListening(intent);
                call.resolve();
            } catch (Exception e) {
                isListening = false;
                call.reject("Failed to initialize speech recognition: " + e.getMessage());
                JSObject err = new JSObject();
                err.put("error", e.getMessage());
                notifyListeners("voiceError", err);
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (speechRecognizer != null && isListening) {
                    speechRecognizer.stopListening();
                }
                JSObject ret = new JSObject();
                ret.put("transcript", currentTranscript != null ? currentTranscript.trim() : "");
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Error stopping voice recognition: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            destroyRecognizer();
            call.resolve();
        });
    }

    // ==========================================
    // TEXT-TO-SPEECH (VOICE OUTPUT) METHODS
    // ==========================================

    private void initTtsIfNeeded(Runnable onReady) {
        if (textToSpeech != null && isTtsInitialized) {
            if (onReady != null) onReady.run();
            return;
        }

        getActivity().runOnUiThread(() -> {
            textToSpeech = new TextToSpeech(getContext(), status -> {
                if (status == TextToSpeech.SUCCESS) {
                    isTtsInitialized = true;
                    textToSpeech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override
                        public void onStart(String utteranceId) {
                            JSObject data = new JSObject();
                            data.put("utteranceId", utteranceId);
                            notifyListeners("ttsStarted", data);
                        }

                        @Override
                        public void onDone(String utteranceId) {
                            JSObject data = new JSObject();
                            data.put("utteranceId", utteranceId);
                            notifyListeners("ttsDone", data);
                        }

                        @Override
                        public void onError(String utteranceId) {
                            JSObject data = new JSObject();
                            data.put("utteranceId", utteranceId);
                            notifyListeners("ttsError", data);
                        }
                    });
                    if (onReady != null) onReady.run();
                } else {
                    isTtsInitialized = false;
                }
            });
        });
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        String language = call.getString("language", "en-US");
        float rate = call.getFloat("rate", 1.0f);
        float pitch = call.getFloat("pitch", 1.0f);

        if (text == null || text.trim().isEmpty()) {
            call.reject("Text cannot be empty");
            return;
        }

        initTtsIfNeeded(() -> {
            getActivity().runOnUiThread(() -> {
                try {
                    Locale locale = (language != null && language.startsWith("hi")) ? new Locale("hi", "IN") : Locale.US;
                    textToSpeech.setLanguage(locale);
                    textToSpeech.setSpeechRate(rate);
                    textToSpeech.setPitch(pitch);

                    String utteranceId = "orion_tts_" + System.currentTimeMillis();
                    textToSpeech.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId);

                    JSObject ret = new JSObject();
                    ret.put("status", "speaking");
                    ret.put("utteranceId", utteranceId);
                    call.resolve(ret);
                } catch (Exception e) {
                    call.reject("TTS speech error: " + e.getMessage());
                }
            });
        });
    }

    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (textToSpeech != null) {
                    textToSpeech.stop();
                }
                JSObject ret = new JSObject();
                ret.put("status", "stopped");
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Error stopping TTS: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void isSpeaking(PluginCall call) {
        boolean speaking = textToSpeech != null && textToSpeech.isSpeaking();
        JSObject ret = new JSObject();
        ret.put("speaking", speaking);
        call.resolve(ret);
    }

    private void destroyRecognizer() {
        if (speechRecognizer != null) {
            try {
                speechRecognizer.cancel();
                speechRecognizer.destroy();
            } catch (Exception ignored) {}
            speechRecognizer = null;
        }
        isListening = false;
    }

    private String getErrorText(int errorCode) {
        switch (errorCode) {
            case SpeechRecognizer.ERROR_AUDIO:
                return "Audio recording error.";
            case SpeechRecognizer.ERROR_CLIENT:
                return "Client side speech recognition error.";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "Insufficient permissions for audio recording.";
            case SpeechRecognizer.ERROR_NETWORK:
                return "Network error in speech service.";
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                return "Network timeout.";
            case SpeechRecognizer.ERROR_NO_MATCH:
                return "No speech recognized. Please try speaking closer to the microphone.";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                return "Speech recognizer is busy.";
            case SpeechRecognizer.ERROR_SERVER:
                return "Speech server error.";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                return "No speech detected.";
            default:
                return "Speech recognition error code: " + errorCode;
        }
    }

    @Override
    protected void handleOnDestroy() {
        destroyRecognizer();
        if (textToSpeech != null) {
            try {
                textToSpeech.stop();
                textToSpeech.shutdown();
            } catch (Exception ignored) {}
            textToSpeech = null;
            isTtsInitialized = false;
        }
        super.handleOnDestroy();
    }
}
