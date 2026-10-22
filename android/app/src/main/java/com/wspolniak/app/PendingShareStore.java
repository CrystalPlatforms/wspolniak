package com.wspolniak.app;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Trzyma w pamięci procesu pliki otrzymane udostępnieniem (F3, #222). Mostek JS
 * odczytuje snapshot ({@link #snapshot()}), strona konsumuje i woła {@link #clear()}
 * — consume-once: kolejny start aplikacji nigdy nie podstawi starych plików.
 * Świadomie bez trwałego zapisu (zgodnie z decyzją PRD o braku draft protection);
 * śmierć procesu przed konsumpcją traci pliki — user udostępnia ponownie.
 * Metody zsynchronizowane: mostek JS działa na wątku WebView, nie na UI.
 */
public final class PendingShareStore {

    private static final PendingShareStore INSTANCE = new PendingShareStore();

    public static PendingShareStore getInstance() {
        return INSTANCE;
    }

    private List<ShareIntentPolicy.PendingFile> files = Collections.emptyList();

    private PendingShareStore() {
    }

    /** Zamienia zawartość („późniejszy intake wygrywa"), robiąc niemodyfikowalną kopię. */
    public synchronized void set(List<ShareIntentPolicy.PendingFile> newFiles) {
        files = Collections.unmodifiableList(new ArrayList<>(newFiles));
    }

    /** Niemodyfikowalny rzut stanu — mostek serwuje bajty z tego samego snapshotu. */
    public synchronized List<ShareIntentPolicy.PendingFile> snapshot() {
        return files;
    }

    public synchronized void clear() {
        files = Collections.emptyList();
    }
}
