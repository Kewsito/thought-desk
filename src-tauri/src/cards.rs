//! Flashcards. Cards are blocks written in pages (a front and a back); this
//! collects them and keeps each card's spaced-repetition progress. The
//! schedule itself is worked out by the UI, which shows the intervals on the
//! answer buttons; this side only checks and stores the result.

use crate::db::{fail, now, Db, Result};
use crate::planner::check_date;
use crate::organize::inline_text;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Review {
    /// Next due date ("YYYY-MM-DD").
    pub due: String,
    /// Days until the next review (0 = again today).
    pub interval: i64,
    pub ease: f64,
    /// Successful reviews in a row.
    pub reps: i64,
    /// Times it was forgotten after being learned.
    pub lapses: i64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Card {
    pub page_id: String,
    pub id: String,
    pub front: String,
    pub back: String,
    /// None until it's first studied.
    pub review: Option<Review>,
}

/// Visits every flashcard block in document order.
fn walk_cards(node: &Value, f: &mut dyn FnMut(&Value)) {
    if node.get("type").and_then(Value::as_str) == Some("flashcard") {
        f(node);
        return;
    }
    for child in node.get("content").and_then(Value::as_array).into_iter().flatten() {
        walk_cards(child, f);
    }
}

fn side_text(card: &Value, index: usize, titles: &HashMap<String, String>) -> String {
    let mut out = String::new();
    if let Some(side) = card.pointer(&format!("/content/{index}")) {
        inline_text(side, Some(titles), &mut out);
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

impl Db {
    /// Every card in live pages that has something on its front.
    pub fn list_cards(&self) -> Result<Vec<Card>> {
        let titles = self.titles()?;
        let (pages, reviews) = {
            let conn = self.conn();
            let mut stmt = conn.prepare(
                "SELECT id, content FROM pages
                 WHERE deleted_at IS NULL AND instr(content, '\"flashcard\"') > 0
                 ORDER BY updated_at DESC",
            )?;
            let pages: Vec<(String, String)> =
                stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<rusqlite::Result<_>>()?;
            let mut stmt =
                conn.prepare("SELECT page_id, card_id, due, interval, ease, reps, lapses FROM card_reviews")?;
            let reviews: HashMap<(String, String), Review> = stmt
                .query_map([], |r| {
                    Ok((
                        (r.get(0)?, r.get(1)?),
                        Review { due: r.get(2)?, interval: r.get(3)?, ease: r.get(4)?, reps: r.get(5)?, lapses: r.get(6)? },
                    ))
                })?
                .collect::<rusqlite::Result<_>>()?;
            (pages, reviews)
        };
        let mut out = Vec::new();
        for (page_id, content) in pages {
            let Ok(doc) = serde_json::from_str::<Value>(&content) else { continue };
            walk_cards(&doc, &mut |card| {
                let Some(id) = card.pointer("/attrs/id").and_then(Value::as_str) else { return };
                let front = side_text(card, 0, &titles);
                if front.is_empty() {
                    return;
                }
                out.push(Card {
                    page_id: page_id.clone(),
                    id: id.to_string(),
                    front,
                    back: side_text(card, 1, &titles),
                    review: reviews.get(&(page_id.clone(), id.to_string())).cloned(),
                });
            });
        }
        Ok(out)
    }

    /// Stores the outcome of studying a card.
    pub fn save_review(&self, page_id: &str, card_id: &str, review: &Review) -> Result<()> {
        check_date(&Some(review.due.clone()))?;
        if !(0..=36_500).contains(&review.interval)
            || !(review.ease.is_finite() && (1.0..=5.0).contains(&review.ease))
            || review.reps < 0
            || review.lapses < 0
            || card_id.is_empty()
            || card_id.len() > 64
        {
            return fail("That review doesn't look right");
        }
        let conn = self.conn();
        let live: Option<i64> = conn
            .query_row("SELECT 1 FROM pages WHERE id = ?1 AND deleted_at IS NULL", [page_id], |r| r.get(0))
            .optional()?;
        if live.is_none() {
            return fail("Page not found");
        }
        conn.execute(
            "INSERT INTO card_reviews (page_id, card_id, due, interval, ease, reps, lapses, reviewed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT (page_id, card_id) DO UPDATE SET
               due = excluded.due, interval = excluded.interval, ease = excluded.ease,
               reps = excluded.reps, lapses = excluded.lapses, reviewed_at = excluded.reviewed_at",
            params![page_id, card_id, review.due, review.interval, review.ease, review.reps, review.lapses, now()],
        )?;
        Ok(())
    }

    /// Forgets the progress of a page's cards (they're new again).
    pub fn reset_reviews(&self, page_id: &str) -> Result<()> {
        self.conn().execute("DELETE FROM card_reviews WHERE page_id = ?1", [page_id])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::PagePatch;
    use std::path::PathBuf;

    fn temp_db() -> Db {
        let dir: PathBuf = std::env::temp_dir().join(format!("td-test-{}", uuid::Uuid::new_v4().simple()));
        Db::open(&dir).expect("open db")
    }

    fn card(id: &str, front: &str, back: &str) -> Value {
        let side = |t: &str, text: &str| {
            if text.is_empty() {
                serde_json::json!({ "type": t })
            } else {
                serde_json::json!({ "type": t, "content": [{ "type": "text", "text": text }] })
            }
        };
        serde_json::json!({
            "type": "flashcard",
            "attrs": { "id": id },
            "content": [side("flashcardFront", front), side("flashcardBack", back)]
        })
    }

    #[test]
    fn cards_are_collected_and_reviews_kept() {
        let db = temp_db();
        let page = db.create_page(None, None, "Bio", "").unwrap();
        let doc = serde_json::json!({ "type": "doc", "content": [
            card("c1", "Mitochondria", "Powerhouse of the cell"),
            { "type": "callout", "content": [card("c2", "Osmosis", "Water across a membrane")] },
            card("c3", "", "no front: skipped"),
        ]});
        db.update_page(&page.id, PagePatch { content: Some(doc.to_string()), ..Default::default() }).unwrap();

        let cards = db.list_cards().unwrap();
        assert_eq!(cards.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(), ["c1", "c2"]);
        assert_eq!(cards[1].back, "Water across a membrane");
        assert!(cards[0].review.is_none());

        let review = Review { due: "2026-10-15".into(), interval: 3, ease: 2.5, reps: 2, lapses: 0 };
        db.save_review(&page.id, "c1", &review).unwrap();
        db.save_review(&page.id, "c1", &Review { reps: 3, ..review.clone() }).unwrap();
        let cards = db.list_cards().unwrap();
        assert_eq!(cards[0].review.as_ref().map(|r| r.reps), Some(3), "upserted");

        assert!(db.save_review(&page.id, "c1", &Review { ease: 9.0, ..review.clone() }).is_err());
        assert!(db.save_review(&page.id, "c1", &Review { due: "soon".into(), ..review.clone() }).is_err());
        assert!(db.save_review("nope", "c1", &review).is_err());

        db.reset_reviews(&page.id).unwrap();
        assert!(db.list_cards().unwrap()[0].review.is_none());
    }
}
