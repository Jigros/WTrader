package io.wtrader.observer;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenMouseEvents;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.ingame.HandledScreen;
import net.minecraft.item.ItemStack;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.screen.slot.Slot;
import io.wtrader.observer.mixin.HandledScreenAccessor;

public final class DonutSmpObserverClient implements ClientModInitializer {
    private final ObserverTransport transport = new ObserverTransport();
    private String openGuiId;
    private String lastGuiSignature;
    private String lastInventorySignature;

    @Override
    public void onInitializeClient() {
        ClientLifecycleEvents.CLIENT_STARTED.register(client -> transport.connect());
        ClientLifecycleEvents.CLIENT_STOPPING.register(client -> transport.emit("client.disconnected", "{\"reason\":\"client_stopping\"}"));
        ClientPlayConnectionEvents.JOIN.register((handler, sender, client) -> transport.emit("client.connected", "{}"));
        ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> {
            closeScreen();
            transport.emit("client.disconnected", "{\"reason\":\"server_disconnected\"}");
        });
        ClientTickEvents.END_CLIENT_TICK.register(this::observeClient);
    }

    private void observeClient(MinecraftClient client) {
        transport.connect();
        observeScreen(client.currentScreen);
        observeInventory(client);
    }

    private void observeScreen(Screen screen) {
        if (!(screen instanceof HandledScreen<?> handledScreen)) {
            closeScreen();
            return;
        }
        ScreenHandler handler = handledScreen.getScreenHandler();
        String guiId = "handled:" + handler.syncId + ":" + handledScreen.getTitle().getString();
        String snapshot = guiSnapshot(guiId, handledScreen, handler);
        String signature = sha256(snapshot);
        if (!guiId.equals(openGuiId)) {
            openGuiId = guiId;
            lastGuiSignature = null;
            ScreenMouseEvents.afterMouseClick(handledScreen).register((ignored, mouseX, mouseY, button) -> observeManualClick(handledScreen, mouseX, mouseY));
        }
        if (!signature.equals(lastGuiSignature)) {
            boolean opened = lastGuiSignature == null;
            lastGuiSignature = signature;
            transport.emit(opened ? "gui.opened" : "gui.snapshot", snapshotWithSignature(snapshot, signature));
        }
    }

    private void closeScreen() {
        if (openGuiId != null) {
            transport.emit("gui.closed", "{\"guiId\":" + quote(openGuiId) + "}");
            openGuiId = null;
            lastGuiSignature = null;
        }
    }

    private void observeManualClick(HandledScreen<?> screen, double mouseX, double mouseY) {
        if (openGuiId == null) return;
        Slot slot = ((HandledScreenAccessor) screen).wtrader$getSlotAt(mouseX, mouseY);
        if (slot != null && slot.id >= 0) {
            transport.emit("manual.click", "{\"slot\":" + slot.id + ",\"guiId\":" + quote(openGuiId) + ",\"guiSignature\":" + quote(lastGuiSignature == null ? "unknown" : lastGuiSignature) + "}");
        }
    }

    private void observeInventory(MinecraftClient client) {
        if (client.player == null) return;
        List<ItemStack> stacks = client.player.getInventory().main;
        StringBuilder entries = new StringBuilder();
        for (int slot = 0; slot < stacks.size(); slot++) {
            ItemStack stack = stacks.get(slot);
            if (stack.isEmpty()) continue;
            if (!entries.isEmpty()) entries.append(',');
            entries.append("{\"slot\":").append(slot).append(",\"item\":").append(item(stack)).append('}');
        }
        String payload = "{\"observedAt\":" + quote(java.time.Instant.now().toString()) + ",\"entries\":[" + entries + "]}";
        String signature = sha256(payload);
        if (!signature.equals(lastInventorySignature)) {
            lastInventorySignature = signature;
            transport.emit("inventory.snapshot", payload);
        }
    }

    private static String guiSnapshot(String guiId, HandledScreen<?> screen, ScreenHandler handler) {
        StringBuilder slots = new StringBuilder();
        for (Slot slot : handler.slots) {
            if (!slots.isEmpty()) slots.append(',');
            ItemStack stack = slot.getStack();
            slots.append("{\"slot\":").append(slot.id).append(",\"item\":").append(stack.isEmpty() ? "null" : item(stack)).append('}');
        }
        return "{\"id\":" + quote(guiId) + ",\"observedAt\":" + quote(java.time.Instant.now().toString()) + ",\"title\":" + quote(screen.getTitle().getString()) + ",\"slotCount\":" + handler.slots.size() + ",\"slots\":[" + slots + "]";
    }

    private static String snapshotWithSignature(String snapshot, String signature) {
        return snapshot + ",\"signature\":" + quote(signature) + "}";
    }

    private static String item(ItemStack stack) {
        return "{\"itemType\":" + quote(String.valueOf(stack.getItem())) + ",\"displayName\":" + quote(stack.getName().getString()) + ",\"quantity\":" + stack.getCount() + ",\"enchantments\":[]}";
    }

    private static String quote(String value) {
        StringBuilder escaped = new StringBuilder("\"");
        for (int i = 0; i < value.length(); i++) {
            char character = value.charAt(i);
            switch (character) {
                case '\\' -> escaped.append("\\\\");
                case '\"' -> escaped.append("\\\"");
                case '\n' -> escaped.append("\\n");
                case '\r' -> escaped.append("\\r");
                case '\t' -> escaped.append("\\t");
                default -> {
                    if (character < 0x20) escaped.append(String.format("\\u%04x", (int) character));
                    else escaped.append(character);
                }
            }
        }
        return escaped.append('\"').toString();
    }

    private static String sha256(String value) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            for (byte valueByte : hash) result.append(String.format("%02x", valueByte));
            return result.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static final class ObserverTransport implements WebSocket.Listener {
        private static final URI BRIDGE_URI = URI.create(System.getProperty("wtrader.bridge.url", "ws://127.0.0.1:32100"));
        private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
        private final ArrayDeque<String> pending = new ArrayDeque<>();
        private WebSocket socket;
        private boolean connecting;
        private long sequence;
        private long lastAttempt;

        synchronized void connect() {
            if (socket != null || connecting || System.currentTimeMillis() - lastAttempt < 2_000) return;
            connecting = true;
            lastAttempt = System.currentTimeMillis();
            WebSocket.Builder builder = client.newWebSocketBuilder().connectTimeout(Duration.ofSeconds(3));
            String token = System.getProperty("wtrader.bridge.token", System.getenv("BRIDGE_TOKEN"));
            if (token != null && !token.isBlank()) builder.header("Authorization", "Bearer " + token);
            builder.buildAsync(BRIDGE_URI, this).whenComplete((connected, error) -> {
                synchronized (this) {
                    connecting = false;
                    if (error == null) {
                        socket = connected;
                        flush();
                    }
                }
            });
        }

        synchronized void emit(String type, String payload) {
            pending.add("{\"protocolVersion\":1,\"type\":" + quote(type) + ",\"sequence\":" + sequence++ + ",\"timestamp\":" + System.currentTimeMillis() + ",\"payload\":" + payload + "}");
            while (pending.size() > 256) pending.removeFirst();
            connect();
            flush();
        }

        private void flush() {
            if (socket == null || pending.isEmpty()) return;
            String frame = pending.removeFirst();
            socket.sendText(frame, true).whenComplete((ignored, error) -> {
                synchronized (this) {
                    if (error != null) {
                        pending.addFirst(frame);
                        socket = null;
                    } else {
                        flush();
                    }
                }
            });
        }

        @Override
        public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
            synchronized (this) { socket = null; }
            return CompletableFuture.completedFuture(null);
        }

        @Override
        public void onError(WebSocket webSocket, Throwable error) {
            synchronized (this) { socket = null; }
        }
    }
}
