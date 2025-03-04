# analytic_manager/models/dashboard_plan.py
from odoo import models, fields

class DashboardPlan(models.Model):
    _name = 'dashboard.plan'
    _description = 'Dashboard Plan'

    name = fields.Char(string="Nom du Plan", required=True)
    plan = fields.Float(string="Plan", help="Objectif financier à atteindre sur une exploitation.")