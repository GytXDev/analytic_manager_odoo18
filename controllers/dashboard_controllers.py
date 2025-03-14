# ot_analytic_manager/controllers/dashboard_controllers.py
# -*- coding: utf-8 -*-
from odoo import http
from odoo.http import request, content_disposition

class DashboardControllers(http.Controller):

    @http.route('/dashboard/resultat_chantier_total', type='json', auth="user", website=True)
    def get_resultat_chantier_total(self, start=None, end=None):
        """
        Calcule et retourne le résultat chantier total 
        pour la période [start, end] (invoice_date).
        """
        Dashboard = request.env['analytic.dashboard'].sudo()
        total = Dashboard.get_resultat_chantier_total_periodise(start, end)
        return {'resultat_chantier_total': total}

    @http.route('/dashboard/progression_moyenne', type='json', auth="user", website=True)
    def get_progression_moyenne(self, start=None, end=None):
        """
        Calcule la progression moyenne des projets 
        pour la période [start, end] (invoice_date).
        """
        Dashboard = request.env['analytic.dashboard'].sudo()
        prog = Dashboard.get_progression_moyenne_periodise(start, end)
        return {'progression_moyenne': prog}

    @http.route('/dashboard/statistiques_projets', type='json', auth="user", website=True)
    def get_statistiques_projets(self):
        """
        Retourne des statistiques globales sur les projets 
        (sans filtrage date ou en appelant la version "non périodisée").
        """
        Dashboard = request.env['analytic.dashboard'].sudo()
        return Dashboard.get_statistiques_projets()

    @http.route('/dashboard/liste_projets', type="json", auth="user", website=True)
    def get_donnees_projets_periodisees(self, start=None, end=None, plan_id=None):
        """
        Retourne la liste des projets avec leurs données 
        calculées sur la période [start, end], 
        en se basant sur invoice_date pour le filtrage.
        On peut aussi filtrer par plan_id.
        """
        Dashboard = request.env['analytic.dashboard'].sudo()
        result = Dashboard.get_projets_periodises(start, end, plan_id)
        return result

    @http.route('/dashboard/update_dashboard', type="json", auth="user", website=True)
    def create_dashboard_for_all_analytic_accounts(self):
        """
        Met à jour le tableau de bord en créant au besoin 
        un enregistrement 'analytic.dashboard' pour chaque compte analytique.
        """
        dashboard_env = request.env['analytic.dashboard'].sudo()
        result = dashboard_env.create_dashboard_for_all_analytic_accounts()
        return {'status': 'success', 'message': result}

    @http.route('/dashboard/liste_plans', type='json', auth='user', website=True)
    def get_plans(self):
        """
        Retourne la liste des plans analytiques 
        (et leurs totaux calculés de façon standard).
        """
        Dashboard = request.env['analytic.dashboard'].sudo()
        result = Dashboard.get_all_plans()
        return {'status': 'success', 'data': result}

    @http.route('/dashboard/update_project', type='json', auth="user", website=True)
    def update_project(self, id, **kwargs):
        """
        Met à jour les champs d'un projet spécifique 
        (analytic.dashboard) dont l'ID analytique = id.
        """
        dashboard_env = request.env['analytic.dashboard'].sudo()
        result = dashboard_env.update_project(id, kwargs)
        return result

    @http.route('/dashboard/get_plan', type='json', auth='user', website=True)
    def dashboard_get_plan(self, plan_id):
        """
        Cherche ou crée un dashboard.plan 
        dont name = str(plan_id).
        """
        plan_model = request.env['dashboard.plan'].sudo()
        plan = plan_model.search([('name', '=', str(plan_id))], limit=1)
        if not plan:
            plan = plan_model.create({
                'name': str(plan_id),
                'plan': 0.0
            })
        return {
            'status': 'success',
            'data': {
                'name': plan.name,
                'plan': plan.plan
            }
        }

    @http.route('/dashboard/update_all_projects', type='json', auth="user", website=True)
    def update_all_projects(self, **kwargs):
        """
        Met à jour (write) les champs de tous les projets 
        (analytic.dashboard).
        """
        dashboard_env = request.env['analytic.dashboard'].sudo()
        result = dashboard_env.update_all_projects(kwargs)
        return result

    @http.route('/dashboard/update_plan', type='json', auth="user", website=True)
    def update_plan(self, plan_id, plan):
        """
        Met à jour ou crée un enregistrement dashboard.plan 
        dont name = str(plan_id).
        """
        plan_model = request.env['dashboard.plan'].sudo()
        existing_plan = plan_model.search([('name', '=', str(plan_id))], limit=1)
        if existing_plan:
            existing_plan.write({'plan': plan})
            return {'status': 'success', 'message': 'Plan mis à jour avec succès'}
        else:
            plan_model.create({'name': str(plan_id), 'plan': plan})
            return {'status': 'success', 'message': 'Plan créé avec succès'}

    @http.route('/dashboard/export_to_excel', type='http', auth="user", website=True)
    def export_to_excel(self):
        """
        Génère un fichier Excel (XLSX) avec les données des projets 
        et le renvoie en tant que réponse HTTP.
        """
        dashboard_env = request.env['analytic.dashboard'].sudo()
        output = dashboard_env.export_to_excel()

        filename = 'Resultats_Analytique.xlsx'
        headers = [
            ('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
            ('Content-Disposition', content_disposition(filename))
        ]
        return request.make_response(output, headers)