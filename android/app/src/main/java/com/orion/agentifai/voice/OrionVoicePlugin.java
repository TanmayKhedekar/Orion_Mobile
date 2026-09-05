package com.orion.agentifai.voice;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
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
        ret.put("available", available);
        ret.put("provider", onDeviceAvailable ? "Android On-Device Speech Recognizer (Snapdragon)" : "Android Speech Recognizer");
        ret.put("model", onDeviceAvailable ? "Whisper-compatible On-Device ASR" : "System ASR Engine");
        ret.put("onDevice", onDeviceAvailable);
        ret.put("npuAccelerated", isSnapdragon && onDeviceAvailable);
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

                // Attempt to create on-device recognizer on Android 12+ (API 31+) if supported
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext())) {
                    speechRecognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
                } else {
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
                        notifyListeners("voiceError", err);
                    }

                    @Override
                    public void onResults(Bundle results) {
                        isListening = false;
                        ArrayList<String> matches = results != null ? results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) : null;
                        String text = (matches != null && !matches.isEmpty()) ? matches.get(0) : currentTranscript;
                        currentTranscript = text;

                        JSObject ret = new JSObject();
                        ret.put("text", text);
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
                ret.put("transcript", currentTranscript);
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
        super.handleOnDestroy();
    }
}
