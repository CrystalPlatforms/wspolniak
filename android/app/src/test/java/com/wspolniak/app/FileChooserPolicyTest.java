package com.wspolniak.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Testy napisu przy natywnej wybierarce (#250). */
public class FileChooserPolicyTest {

    @Test
    public void caption_mentionsTenPhotoLimit() {
        String caption = FileChooserPolicy.caption();
        assertEquals("Wybierz do 10 zdjęć", caption);
        assertTrue(caption.contains("10"));
    }
}
