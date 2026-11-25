package com.wspolniak.app;

/**
 * Napis przy otwarciu natywnej wybierarki plików (issue #250): picker
 * systemowy nie ma własnego miejsca na limit, więc w momencie jego otwarcia
 * wrapper pokazuje Toast z limitem 10 zdjęć. Klej w {@link MainActivity}.
 */
public enum FileChooserPolicy {

    ;

    /** Napis pokazywany Toastem przy otwarciu pickera (#250). */
    public static String caption() {
        return "Wybierz do 10 zdjęć";
    }
}
