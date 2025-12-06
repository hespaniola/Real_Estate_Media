# System Design Document
10 Buck Productions — Real Estate Media Platform  
Stage 4 Software Engineering Project  
Author: Hunter Espaniola

## 1. Purpose
The system models essential workflow processes of a real estate media business.  
This includes client bookings, scheduling, service selection, deliverable production,
and project completion. The design reflects real processes from my business brand.

## 2. Functional Overview
The system supports:
• Creating client records
• Assigning media packages
• Managing bookings and service selection
• Tracking project states
• Validating pricing rules

## 3. Architecture Structure
The system follows object-oriented principles.  
Core entities represent the business domain:

Client → Booking → Service Package → Project State

Each class maintains responsibility for its own behavior and attributes.
The structure allows future expansion toward web deployment or database integration.

## 4. Design Decisions
Key decisions include:
• Encapsulation for clarity and modification safety
• State progression rules to model real workflow
• Separation of concerns for extensibility
• Simulation capability while remaining production-minded

## 5. Testing Approach
Automated tests validate:
• Accurate price and workflow behavior
• Enforcement of valid project transitions
• Handling of common edge cases surrounding scheduling

All tests passed successfully.

## 6. Configurability
The system uses a configuration file to manage adjustable parameters such as:
• pricing values
• rule thresholds
• operational settings

This supports maintainability and potential client-specific customization.

## 7. Future Expansion
A logical extension of this system includes:
• User interface and web submission forms
• Database storage
• Admin and client panels
• File uploading and tracking
• Embedded scheduling and invoicing logic

## 8. Summary
This software models real business workflow for media production.  
It demonstrates design intent, rule enforcement, testability, and project state
control while maintaining an expandable backbone for future development.
