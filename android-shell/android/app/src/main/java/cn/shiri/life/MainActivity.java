package cn.shiri.life;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.app.PendingIntent;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import java.util.function.Consumer;

public class MainActivity extends BridgeActivity {
    private ActivityResultLauncher<IntentSenderRequest> photoDeletion;
    private Consumer<Integer> deletionResult;
    @Override public void onCreate(Bundle state) {
        registerPlugin(PhotoCollectorPlugin.class);
        registerPlugin(PhotoOriginalsPlugin.class);
        registerPlugin(AuthVaultPlugin.class);
        super.onCreate(state);
        photoDeletion=registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(),result->{
            Consumer<Integer> callback=deletionResult;deletionResult=null;if(callback!=null)callback.accept(result.getResultCode());
        });
        // Revoke the old all-photo uploader on upgrade; gallery queue/logs stay intact.
        PrivateUpload.suspendAll(this);
    }
    void requestPhotoDeletion(PendingIntent request,Consumer<Integer> result){
        if(deletionResult!=null)throw new IllegalStateException("请先完成上一次系统删除请求");
        deletionResult=result;
        try{photoDeletion.launch(new IntentSenderRequest.Builder(request.getIntentSender()).build());}
        catch(RuntimeException error){deletionResult=null;throw error;}
    }
}
