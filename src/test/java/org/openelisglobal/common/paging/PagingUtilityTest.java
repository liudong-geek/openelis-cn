/**
 * The contents of this file are subject to the Mozilla Public License Version 1.1 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy of the
 * License at http://www.mozilla.org/MPL/
 *
 * <p>Software distributed under the License is distributed on an "AS IS" basis, WITHOUT WARRANTY OF
 * ANY KIND, either express or implied. See the License for the specific language governing rights
 * and limitations under the License.
 *
 * <p>The Original Code is OpenELIS code.
 *
 * <p>Copyright (C) CIRG, University of Washington, Seattle WA. All Rights Reserved.
 */
package org.openelisglobal.common.paging;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertSame;

import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.springframework.mock.web.MockHttpSession;

public class PagingUtilityTest {
    private static final String PAGE_CACHE = "PagingUtilityTestPageCache";
    private static final String PAGE_MAPPING = "PagingUtilityTestPageMapping";

    private PagingUtility<List<String>> pagingUtility;
    private MockHttpSession session;
    private List<List<String>> cachedPages;

    @Before
    public void setUp() {
        pagingUtility = new PagingUtility<>(PAGE_CACHE, PAGE_MAPPING);
        session = new MockHttpSession();
        cachedPages = List.of(List.of("page-one"), List.of("page-two"));
        session.setAttribute(PAGE_CACHE, cachedPages);
    }

    @Test
    public void updatePagedResultsUsesTheRequestedOneBasedPage() {
        PagingBean paging = paging("2");
        List<String> clientItems = List.of("updated-value");
        RecordingUpdater updater = new RecordingUpdater();

        pagingUtility.updatePagedResults(session, clientItems, paging, updater);

        assertEquals(1, updater.callCount);
        assertSame(cachedPages.get(1), updater.cacheItems);
        assertSame(clientItems, updater.clientItems);
    }

    @Test
    public void updatePagedResultsIgnoresMissingPagingMetadata() {
        assertIgnored(null);
        assertIgnored(paging(null));
    }

    @Test
    public void updatePagedResultsIgnoresInvalidOrOutOfRangePage() {
        for (String currentPage : List.of("", " ", "0", "-1", "3", "not-a-number", "2147483648")) {
            assertIgnored(paging(currentPage));
        }
    }

    private void assertIgnored(PagingBean paging) {
        RecordingUpdater updater = new RecordingUpdater();

        pagingUtility.updatePagedResults(session, List.of("untrusted-value"), paging, updater);

        assertEquals(0, updater.callCount);
        assertEquals(List.of(List.of("page-one"), List.of("page-two")), cachedPages);
    }

    private PagingBean paging(String currentPage) {
        PagingBean paging = new PagingBean();
        paging.setCurrentPage(currentPage);
        return paging;
    }

    private static class RecordingUpdater implements IPageUpdater<List<String>> {
        private int callCount;
        private List<String> cacheItems;
        private List<String> clientItems;

        @Override
        public void updateCache(List<String> cacheItems, List<String> clientItems) {
            callCount++;
            this.cacheItems = cacheItems;
            this.clientItems = clientItems;
        }
    }
}
