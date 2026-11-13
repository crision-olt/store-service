const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { authenticateToken } = require('../middleware/auth');
const { parseListQuery, parseProductInput } = require('../utils/product-query');

router.use(authenticateToken);

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const isId = (value) => Number.isInteger(value) && value > 0 && value <= 2147483647;

const parseName = (body) => {
  if (!body || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100) {
    return null;
  }
  return body.name.trim();
};

// Create product
router.post('/', async (req, res) => {
  const { product: input, error } = parseProductInput(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const product = await Product.create(input);
    res.status(201).json(product);
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(409).json({ error: 'A product with this SKU already exists' });
    }
    if (err.code === FOREIGN_KEY_VIOLATION) {
      return res.status(400).json({ error: 'Category or subcategory is invalid for this product' });
    }
    console.error('Create product error:', err);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// List products with filters, sorting and pagination
router.get('/', async (req, res) => {
  const { filters, error } = parseListQuery(req.query);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    res.status(200).json(await Product.findAll(filters));
  } catch (err) {
    console.error('List products error:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Category routes precede /:id.
router.get('/categories', async (req, res) => {
  try {
    res.status(200).json(await Product.findCategories());
  } catch (err) {
    console.error('List categories error:', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.post('/categories', async (req, res) => {
  const name = parseName(req.body);
  if (!name) return res.status(400).json({ error: 'name must be a non-empty string of at most 100 characters' });
  try {
    res.status(201).json(await Product.createCategory(name));
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) return res.status(409).json({ error: 'Category already exists' });
    console.error('Create category error:', err);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

router.get('/subcategories', async (req, res) => {
  const { category } = req.query;
  if (category !== undefined && (typeof category !== 'string' || !/^[1-9]\d*$/.test(category) || !isId(Number(category)))) {
    return res.status(400).json({ error: 'category must be a positive integer ID' });
  }

  try {
    res.status(200).json(await Product.findSubcategories(category === undefined ? undefined : Number(category)));
  } catch (err) {
    console.error('List subcategories error:', err);
    res.status(500).json({ error: 'Failed to fetch subcategories' });
  }
});

router.post('/subcategories', async (req, res) => {
  const name = parseName(req.body);
  if (!name) return res.status(400).json({ error: 'name must be a non-empty string of at most 100 characters' });
  if (!isId(req.body.categoryId)) return res.status(400).json({ error: 'categoryId must be a positive integer ID' });
  try {
    res.status(201).json(await Product.createSubcategory(name, req.body.categoryId));
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) return res.status(409).json({ error: 'Subcategory already exists in this category' });
    if (err.code === FOREIGN_KEY_VIOLATION) return res.status(400).json({ error: 'Category does not exist' });
    console.error('Create subcategory error:', err);
    res.status(500).json({ error: 'Failed to create subcategory' });
  }
});

// Get product by id
router.get('/:id', async (req, res) => {
  if (!/^\d+$/.test(req.params.id) || Number(req.params.id) > 2147483647) {
    return res.status(400).json({ error: 'Product id must be a positive integer' });
  }

  try {
    const product = await Product.findById(Number(req.params.id));
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.status(200).json(product);
  } catch (err) {
    console.error('Get product error:', err);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

module.exports = router;
