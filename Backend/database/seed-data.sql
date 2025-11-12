
-- Sample seed data for CargoSmart database

-- Sample users
INSERT INTO public.users (name, email, password, role, "createdAt", "updatedAt", verified, client_name, contact_person, phone, address)
VALUES 
  ('Admin User', 'admin@cargosmart.com', '$2a$10$XOPbrlUPQdwdJUpSrIF6X.LbE14qsMmKGq6QWaaPeUG.O41tXYvVG', 'admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true, NULL, NULL, '555-111-2222', NULL),
  ('John Doe', 'john@example.com', '$2a$10$XOPbrlUPQdwdJUpSrIF6X.LbE14qsMmKGq6QWaaPeUG.O41tXYvVG', 'client', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true, 'ABC Logistics', 'John Doe', '555-123-4567', '123 Main St, Anytown, USA'),
  ('Jane Smith', 'jane@example.com', '$2a$10$XOPbrlUPQdwdJUpSrIF6X.LbE14qsMmKGq6QWaaPeUG.O41tXYvVG', 'client', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true, 'XYZ Transport', 'Jane Smith', '555-987-6543', '456 Oak Ave, Somewhere, USA')
ON CONFLICT (email) DO NOTHING;

-- Sample products
INSERT INTO public.products (name, description, price, stock, category_id)
VALUES 
  ('Standard Shipping', 'Standard shipping service for regular packages', 49.99, 9999, 1),
  ('Express Shipping', 'Next-day delivery for urgent shipments', 99.99, 9999, 1),
  ('Heavy Freight', 'Shipping service for heavy or oversized items', 199.99, 9999, 2)
ON CONFLICT DO NOTHING;

-- Sample orders
INSERT INTO public.orders (user_id, total_amount, status, product_id, quantity, price_per_unit)
VALUES 
  (2, 49.99, 'completed', 1, 1, 49.99),
  (2, 99.99, 'processing', 2, 1, 99.99),
  (3, 399.98, 'pending', 3, 2, 199.99)
ON CONFLICT DO NOTHING;

-- Sample addresses
INSERT INTO public.addresses (user_id, street, city, state, postal_code, country, is_default)
VALUES 
  (2, '123 Main St', 'Anytown', 'CA', '12345', 'USA', true),
  (3, '456 Oak Ave', 'Somewhere', 'NY', '67890', 'USA', true)
ON CONFLICT DO NOTHING;

-- Sample invoices
INSERT INTO public.invoices (client_id, order_id, invoice_number, due_date, amount, status)
VALUES 
  (2, 1, 'INV-2025-001', CURRENT_DATE + INTERVAL '30 days', 49.99, 'paid'),
  (2, 2, 'INV-2025-002', CURRENT_DATE + INTERVAL '30 days', 99.99, 'pending'),
  (3, 3, 'INV-2025-003', CURRENT_DATE + INTERVAL '30 days', 399.98, 'pending')
ON CONFLICT DO NOTHING;

-- Sample payments
INSERT INTO public.payments (order_id, user_id, amount, payment_method, status, payment_status, invoice_id, payment_date)
VALUES 
  (1, 2, 49.99, 'credit_card', 'completed', 'Paid', 1, CURRENT_DATE),
  (2, 2, 0.00, 'pending', 'pending', 'Not Yet Paid', 2, NULL),
  (3, 3, 0.00, 'pending', 'pending', 'Not Yet Paid', 3, NULL)
ON CONFLICT DO NOTHING;

-- Sample shipment tracking
INSERT INTO public.shipment_tracking (order_id, carrier, tracking_number, estimated_delivery, status, location, user_id)
VALUES 
  (1, 'FedEx', 'FDX123456789', CURRENT_DATE + INTERVAL '5 days', 'in_transit', 'Distribution Center', 2),
  (2, 'UPS', 'UPS987654321', CURRENT_DATE + INTERVAL '3 days', 'shipped', 'Local Facility', 2)
ON CONFLICT (tracking_number) DO NOTHING;

-- Sample shipments
INSERT INTO public."Shipments" (shipmentid, "clientId", clientid, revenue, createdat, updatedat)
VALUES 
  ('SHP-001', 2, 2, 49.99, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('SHP-002', 3, 3, 399.98, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
    