package com.orion.agentifai;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.orion.agentifai.voice.OrionVoicePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OrionVoicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}

