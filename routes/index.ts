import express from "express";

const router = express.Router();

/* GET home page. */
router.get("/", function (req, res, next) {
  res.render("index", { title: "Express" });
});

router.get("/test", (req, res) => {
  res.send("Howdy y'all");
});

export default router;
