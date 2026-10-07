import "server-only"
import { pool } from "@/lib/db"
import { PhotoReviewStore } from "./photo-review-store"
export const photoReview = new PhotoReviewStore(pool)
