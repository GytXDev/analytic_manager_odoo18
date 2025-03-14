# -*- coding: utf-8 -*-
from odoo import http
from odoo.http import request, content_disposition

class DashboardControllers(http.Controller):

    @http.route('/dashboard/resultat_chantier_total', type='json', auth="user", website=True)
    def get_resultat_chantier_total(self, start=None, end=None):
        """
        Calcule et retourne le résultat chantier total 
        pour la période [start, end].
        """
        Dashboard = request.env['analytic.dashboard'].sudo()
        total = Dashboard.get_resultat_chantier_total_periodise(start, end)
        return {'resultat_chantier_total': total}

    @http.route('/dashboard/progression_moyenne', type='json', auth="user", website=True)
    def get_progression_moyenne(self, start=None, end=None):
        """
        Calcule la progression moyenne des projets 
        pour la période [start, end].
        """
        Dashboard = request.env['analytic.dashboard'].sudo()
        prog = Dashboard.get_progression_moyenne_periodise(start, end)
        return {'progression_moyenne': prog}

    @http.route('/dashboard/statistiques_projets', type='json', auth="user", website=True)
    def get_statistiques_projets(self):
        """
        Retourne des statistiques globales sur les projets 
        (sans filtrage date, ou à adapter).
        """
        Dashboard = request.env['analytic.dashboard'].sudo()
        return Dashboard.get_statistiques_projets()

    @http.route('/dashboard/liste_projets', type="json", auth="user", website=True)
    def get_donnees_projets_periodisees(self, start=None, end=None, plan_id=None):
        """
        Retourne la liste des projets avec leurs données 
        calculées sur la période [start, end].
        On peut aussi filtrer par plan_id.
        """
        Dashboard = request.env['analytic.dashboard'].sudo()
        result = Dashboard.get_projets_periodises(start, end, plan_id)
        return result

    @http.route('/dashboard/update_dashboard', type="json", auth="user", website=True)
    def create_dashboard_for_all_analytic_accounts(self):
        """
        Crée des dashboards pour chaque compte analytique si manquants.
        """
        Dashboard = request.env['analytic.dashboard'].sudo()
        msg = Dashboard.create_dashboard_for_all_analytic_accounts()
        return {'status': 'success', 'message': msg}

    @http.route('/dashboard/liste_plans', type='json', auth='user', website=True)
    def get_plans(self):
        """
        Retourne la liste des plans analytiques (sans filtrage).
        """
        Dashboard = request.env['analytic.dashboard'].sudo()
        result = Dashboard.get_all_plans()
        return {'status': 'success', 'data': result}

    @http.route('/dashboard/update_project', type='json', auth="user", website=True)
    def update_project(self, id, **kwargs):
        """
        Met à jour un projet spécifique.
        """
        Dashboard = request.env['analytic.dashboard'].sudo()
        res = Dashboard.update_project(id, kwargs)
        return res

    @http.route('/dashboard/update_all_projects', type='json', auth="user", website=True)
    def update_all_projects(self, **kwargs):
        """
        Met à jour tous les projets.
        """
        Dashboard = request.env['analytic.dashboard'].sudo()
        res = Dashboard.update_all_projects(kwargs)
        return res

    @http.route('/dashboard/export_to_excel', type='http', auth="user", website=True)
    def export_to_excel(self):
        """
        Génère un fichier Excel avec toutes les données 
        (sans filtrage date).
        """
        Dashboard = request.env['analytic.dashboard'].sudo()
        output = Dashboard.export_to_excel()

        filename = 'Resultats_Analytique.xlsx'
        headers = [
            ('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
            ('Content-Disposition', content_disposition(filename))
        ]
        return request.make_response(output, headers)
