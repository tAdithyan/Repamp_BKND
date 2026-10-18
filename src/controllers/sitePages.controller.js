import SitePage from "../models/sitePage.model.js";
import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";

const ADMIN_ROLES = new Set(["ROL_1", "ROL_2", "SuperAdmin", "Admin"]);
const PAGE_DEFAULTS = [
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    content: "<h2>Your privacy matters</h2><p>This page explains how REPAMP collects, uses, and protects information when you use the waste collection service. The administrator can update this policy from the admin panel.</p><h3>Information and use</h3><p>Information you provide, such as contact details, pickup requests, and service location, is used to provide and improve the service and to communicate with you about your account and pickups.</p><h3>Your choices</h3><p>Contact our support team if you have questions about your information or want to request an update.</p>",
  },
  {
    slug: "about-us",
    title: "About Us",
    content: "<h2>About REPAMP</h2><p>We make it easier for communities to manage waste responsibly through convenient pickup scheduling and collection services.</p><h3>Our service</h3><p>Use the app to schedule pickups, follow your collection history, and get support from our team.</p>",
    socialLinks: [],
  },
];

const ensureDefaults = async () => Promise.all(PAGE_DEFAULTS.map(({ slug, ...defaults }) =>
  SitePage.findOneAndUpdate({ slug }, { $setOnInsert: { slug, ...defaults } }, { new: true, upsert: true, setDefaultsOnInsert: true })
));

export const getPublicPage = async (req, res, next) => {
  try {
    const slug = req.params.slug === "contact" ? "about-us" : req.params.slug;
    const pageDefaults = PAGE_DEFAULTS.find(page => page.slug === slug);
    if (!pageDefaults) throw new ApiError(404, "Page not found.");
    let page = await SitePage.findOne({ slug }).lean();
    if (!page) {
      const legacyAbout = slug === "about-us" ? await SitePage.findOne({ slug: "contact" }).lean() : null;
      const { slug: pageSlug, ...defaults } = pageDefaults;
      if (legacyAbout) defaults.content = legacyAbout.content;
      await SitePage.findOneAndUpdate({ slug: pageSlug }, { $setOnInsert: { slug: pageSlug, ...defaults } }, { upsert: true, setDefaultsOnInsert: true });
      page = await SitePage.findOne({ slug }).lean();
    }
    if (!page) throw new ApiError(404, "Page not found.");
    res.json(new ApiResponse(200, { slug: page.slug, title: page.title, content: page.content, socialLinks: page.socialLinks || [], updatedAt: page.updatedAt }, "Page fetched successfully."));
  } catch (error) { next(error); }
};

export const getAdminPages = async (req, res, next) => {
  try {
    if (!ADMIN_ROLES.has(req.user?.role)) throw new ApiError(403, "Administrator access is required.");
    const oldContactPage = await SitePage.findOne({ slug: "contact" }).lean();
    const existingAboutPage = await SitePage.findOne({ slug: "about-us" }).lean();
    if (oldContactPage && !existingAboutPage) {
      await SitePage.findOneAndUpdate({ slug: "about-us" }, { $setOnInsert: { slug: "about-us", title: "About Us", content: oldContactPage.content, socialLinks: [] } }, { upsert: true, setDefaultsOnInsert: true });
    }
    const pages = await ensureDefaults();
    res.json(new ApiResponse(200, pages, "Pages fetched successfully."));
  } catch (error) { next(error); }
};

export const updateAdminPage = async (req, res, next) => {
  try {
    if (!ADMIN_ROLES.has(req.user?.role)) throw new ApiError(403, "Administrator access is required.");
    const { slug } = req.params;
    if (!PAGE_DEFAULTS.some(page => page.slug === slug)) throw new ApiError(404, "Page not found.");
    const title = String(req.body.title || "").trim();
    const content = String(req.body.content || "").trim();
    const socialLinks = req.body.socialLinks === undefined ? [] : req.body.socialLinks;
    if (!title || !content) throw new ApiError(400, "A page title and content are required.");
    if (title.length > 120 || content.length > 50000) throw new ApiError(400, "Page content is too long.");
    if (!Array.isArray(socialLinks) || socialLinks.length > 8) throw new ApiError(400, "Provide up to eight social media links.");
    const allowedPlatforms = new Set(["Facebook", "Instagram", "YouTube", "X", "LinkedIn", "TikTok", "Other"]);
    for (const link of socialLinks) {
      let parsedUrl;
      try { parsedUrl = new URL(String(link.url || "")); } catch { throw new ApiError(400, "Each social media link must be a valid URL."); }
      if (!allowedPlatforms.has(link.platform) || !["http:", "https:"].includes(parsedUrl.protocol)) throw new ApiError(400, "Social links must use a supported platform and a valid web address.");
    }
    const page = await SitePage.findOneAndUpdate(
      { slug },
      { $set: { title, content, socialLinks, updatedBy: req.user._id }, $setOnInsert: { slug } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.json(new ApiResponse(200, page, "Page saved successfully."));
  } catch (error) { next(error); }
};
